# Dataset pipeline

Builds a Tersect Browser dataset from the files a user already has: a
reference FASTA, gene models (GFF3) and one VCF per accession. It writes a
**manifest** that points at those files, and the pipeline does the rest.

```sh
./scripts/dataset validate datasets/tomato-sl250.yaml   # check a manifest
./scripts/dataset build    datasets/tomato-sl250.yaml   # build and publish
./scripts/dataset status                                # recent builds
./scripts/dataset remove   "Tomato SL2.50 (Aflitos 2014)"
```

`scripts/dataset` runs the `pipeline` container (`Dockerfile.pipeline`).
Inside it the command is `tb-dataset`; outside Docker it is
`PYTHONPATH=pipeline python -m tbpipeline.cli` with `pipeline/environment.yml`.

## Manifests

See [`datasets/tomato-sl250.yaml`](../datasets/tomato-sl250.yaml) (built from
VCFs) and [`datasets/soybean-hn.yaml`](../datasets/soybean-hn.yaml) (an
existing Tersect index only).

| Key | |
|---|---|
| `id` | Dataset name shown in the browser |
| `reference.id` | Reference genome id (shared by datasets on the same assembly) |
| `reference.fasta`, `reference.gff` | Path (relative to the manifest) or URL |
| `reference.chromosomes` | Optional: chromosomes to include (default: all in the FASTA) |
| `annotation.snpeff` | `build` (snpEff database from the FASTA and GFF), a prebuilt snpEff database name, or `none` |
| `tersect.homozygous`, `tersect.types` | Which variants the distance index counts (`tersect build -H`, `-t`) |
| `samples[]` | `name`, `vcf` (path or URL), optional `label`, `group`, `vcf_sample` (to pick a sample from a multi-sample VCF) and `info` (extra columns) |
| `samples[].rename_contigs` | Optional map of VCF contig name → reference sequence name, for VCFs named differently from the FASTA (e.g. `chr1: SL2.50ch01`). Applied first in normalise (`bcftools annotate --rename-chrs`); contigs not in the map keep their names |
| `index` | Instead of `samples`: an existing `.tsi` (no variant search) |

URLs are downloaded once into a shared cache, with retries and resume. Local
paths must exist; inside Docker they are paths under `/app` (the repository) or
`/data` (`TB_DATA_DIR`, default `./test-data/datasets`). Setting
`TB_PIPELINE_ALLOWED_ROOTS` confines local paths to given directories, which an
upload service will need.

## Stages

```
EXTRACT     reference ── gene models          samples (download or link)
TRANSFORM   normalise each sample ──┬── Tersect index (distances)
                                    ├── merge + snpEff, per chromosome ── variants.parquet
            gene models ── genes.parquet, snpEff database
            genome browser files (bgzip, tabix, JBrowse config)
LOAD        stage: Parquet → ClickHouse staging tables
            publish: reference + distance matrices (MongoDB)
                     → swap staged partitions into the live tables (ClickHouse)
                     → dataset record (MongoDB): the dataset appears here
```

**Normalise** (`genomics.normalise_sample`): rename contigs (`rename_contigs`), select the sample, keep the chosen
chromosomes, drop existing annotations, split multi-allelic sites and
left-align indels against the reference. Sites whose REF disagrees with the
reference are dropped and counted. Then keep only sites where the accession
carries the alternative allele, and rename the sample to the manifest name.
Contig names that do not match the reference fail here, with both lists in
the message; a `rename_contigs` map fixes them.

**Failures** (`tbpipeline/failures.py`): each step records the exception it
raised in `failures/` in the working directory, with its rule and wildcards.
`tb-dataset status` shows the first one; the builder service turns it into
the build's error (stage, accession, file, what to fix).

**Annotate**: snpEff runs once per chromosome on the merged accessions, so a
variant shared by many accessions is annotated once. Upstream and downstream
effects are skipped, as on SGN.

**Tables** (`tables.py`, `clickhouse/schema.sql`): one row per variant with
its effects as parallel arrays and its carriers (accessions with a
non-reference genotype, and their dosage), sorted by
`(dataset, chrom, pos)`. Bloom-filter indexes on `genes` and `carriers` make
gene and accession lookups skip most of the data. Gene models go in a second
table for search by id, name or description.

## Guarantees

- **Validated before work starts.** Names, paths, chromosomes and options
  are checked when the manifest loads. Every external tool gets an argument
  list; nothing goes through a shell.
- **Resumable.** Snakemake skips finished steps; a failed or interrupted
  build continues where it stopped. Editing the manifest re-runs only what
  depends on the change (adding a sample re-runs the merge, index and
  tables, not the other samples).
- **Published last, all at once.** Nothing users see changes until
  `publish`. Variant tables are swapped in with `REPLACE PARTITION`, so search
  never shows half a dataset. A first build that fails leaves nothing
  visible. One exception: a rebuild replaces the distance matrices in place
  during `publish`.
- **Durable outputs.** `<localDbPath>/datasets/<dataset>/` holds the
  Tersect index, the Parquet tables and `qc.json` (per-sample and
  per-chromosome counts). ClickHouse can be reloaded from the Parquet files
  without rerunning the pipeline.
- **Safe to interrupt.** Steps write to a temporary name and rename on
  success, so a killed step never leaves a file that looks finished. Only one
  build of a dataset runs at a time; a lock left by a killed build is cleared
  automatically.
- **Memory-aware.** Steps declare their memory and Snakemake runs only as
  many at once as fit in 80% of available memory (`--memory` to override).
- **Robust to old VCFs.** Missing `##contig` lines, undeclared tags and
  sample names that are file paths are handled.
- **Recorded.** Every build is logged in the `dataset_builds` collection
  (status, timings, manifest hash). Step logs are in
  `<localDbPath>/pipeline/<dataset>/logs/`.

## Design decisions

**ClickHouse with Parquet.** Variant search is a filtered scan over sorted
columns (interval, impact, gene, carrier), which is what a columnar store does
best. ClickHouse also serves many concurrent users and scales to billions of
rows. Parquet is the stored output, independent of the database: readable
by DuckDB, pandas or Spark, and the way to reload or migrate.

**Snakemake.** File-based steps that resume, with parallelism across samples
and chromosomes, and plain Python in the rules. Nextflow would be the choice
for HPC schedulers or cloud batch at very large scale. The stage functions in
`tbpipeline/` do not depend on Snakemake, so they could be wrapped as Nextflow
processes.

**No PySpark.** See the measurements below. Spark's strength is distributed
dataframe processing, and nothing here needs it. The heavy work is done by
bcftools, snpEff and Tersect, which Spark would only wrap. The tabular step
(VCF to Parquet) is per chromosome and runs in parallel already. The
aggregation that would need a cluster, querying billions of genotype rows,
is what ClickHouse is for. Spark would add a JVM cluster to deploy and
operate with nothing in return. If one cohort ever outgrew a single
machine, the next steps would be more Snakemake parallelism (split
chromosomes into regions) or a Nextflow executor, before Spark.

## Measurements

Eight accessions of the Aflitos et al. (2014) panel (`datasets/tomato-sl250.yaml`)
on a 10-core laptop, Docker VM with 8 GB, after downloading:

| | |
|---|---|
| Input | 8 VCFs, 7.6 M sample-variants (4.7 M in *S. pimpinellifolium* alone); ~22% of indels needed left-alignment, no REF mismatches |
| snpEff database (SL2.50 + ITAG2.4) | built once, ~1.5 min, reused by later builds |
| Merge + annotate + Parquet + stage, 12 chromosomes | under 3 min |
| Publish (gaps, distance matrices, swap, record) | ~1 min |
| Result | 5.2 M variants, 6,901 HIGH impact, 33,838 genes; 69 MB of Parquet, 85 MB in ClickHouse |
| Queries | interval/impact or gene: ~0.25 s through the API, including a whole-chromosome scan |

Extrapolating to the full 84-accession panel gives a few tens of millions of
variants and on the order of 10^8 carrier entries. That still fits one machine
and one ClickHouse server comfortably, which is the basis for "no PySpark".

## Builder service

The web UI's dataset upload flow talks to a FastAPI service in
`tbpipeline/server/` (contract: `web/src/features/datasets/types.ts`). It runs
in the pipeline image as the compose service `builder`, started by
`docker compose up`, on port 4310 under `/api`; the web dev server proxies
`<base>api/*` to it (`BUILDER_URL`). Outside Docker:
`PYTHONPATH=pipeline python -m tbpipeline.server`. API docs at `/api/docs`.

| Route | |
|---|---|
| `GET /api/config`, `/api/storage` | Feature flags; free and total bytes on the data disk |
| `GET /api/server-files?path=` | Browse the shared server folders |
| `POST /api/datasets/check-urls` | HEAD (or a one-byte GET; FTP `SIZE`) per URL |
| `POST /api/datasets/inspect` | FASTA sequences, VCF samples and contigs, GFF seqids, `.tsi` samples |
| `/api/uploads` | Resumable uploads, [tus 1.0.0](https://tus.io/protocols/resumable-upload) with creation, termination and checksum |
| `/api/drafts` | Wizard drafts (MongoDB `dataset_drafts`) |
| `/api/datasets`, `/api/builds` | Published datasets and the build queue |
| `PATCH /api/datasets/{id}` | `{listed}`: show the dataset in, or hide it from, the public dataset list (share links keep working) |
| `POST /api/assistant` | Dataset assistant, server-sent events (below); 503 unless configured |

**Files.** Uploads go to `<localDbPath>/uploads/<id>/<file name>` with
`upload.json` (size, offset, sha256 computed on the server, complete).
Server folders are `TB_SERVER_FOLDERS` (colon-separated, default `/data`,
mounted read-only) and are read in place; paths are confined to them by real
path, so `..` and symlinks cannot leave them. `TB_PIPELINE_ALLOWED_ROOTS`
must cover the uploads folder and the server folders (see
`docker-compose.yml`).

**URLs** must be http, https or ftp. Hosts that resolve to private, loopback
or link-local addresses are refused, including on redirects
(`TB_BUILDER_ALLOW_PRIVATE_URLS=1` allows them, for development).

**Inspect** reads only what it needs: VCF headers (`bcftools view -h`, also
remote), FASTA indexes (`samtools faidx`, written to
`pipeline/cache/inspect/` because server folders are read-only; plain gzip is
read in Python). A FASTA given by URL uses `<url>.fai` if the server has
one; otherwise it is downloaded in the background into the pipeline's
download cache, which the build then reuses, and inspect returns a note until
it has finished. Results are cached by path, size and modification time.

Other settings: `TB_MAX_UPLOAD` (bytes, no limit by default),
`TB_BUILDER_PORT` (4310), and the assistant's below.

### Dataset assistant

An optional chat panel in the wizard (`server/assistant*.py`, contract
`web/src/features/datasets/assistant/types.ts`). It reads papers, folder
listings and supplementary tables and *proposes* form values; it cannot save,
build or delete anything, and proposals only enter the manifest when the user
accepts them in the form, through the usual validation. The server checks
every proposed URL (as `check-urls` does), leaves unreachable ones out and
offers no Apply on a card without a reachable link. Each proposal carries the
source the model cited.

It talks to any OpenAI-compatible chat completions endpoint with tool
calling, meant to run on this machine or network so that no paper, file name
or genotype goes to an outside model service (papers themselves are fetched
from Crossref, Europe PMC or the publisher). Off unless `TB_ASSISTANT_URL`
is set; the panel is then absent.

| Variable | |
|---|---|
| `TB_ASSISTANT_URL` | Base URL including `/v1`, e.g. `http://host.docker.internal:11434/v1` |
| `TB_ASSISTANT_MODEL` | Default `qwen3:14b` (~10 GB with an 8k context; on a 16 GB Mac keep Docker's memory cap near 6 GB). `qwen3:8b` is lighter and also reliable; both can show their reasoning (`think`). `mistral:7b` was tried and rarely calls tools |
| `TB_ASSISTANT_API_KEY` | Sent as a bearer token, if the server needs one |
| `TB_ASSISTANT_TIMEOUT` | Seconds per turn, default 600 |
| `TB_ASSISTANT_CONTEXT_CHARS` | Prompt budget in characters (older tool results are shortened first). 14000 for an 8k model context (compose default), 24000 for 16k |
| `TB_ASSISTANT_REASONING` | `reasoning_effort` sent to the server, default `none` (no thinking); `default` omits it |

With Ollama on a Mac, run it natively (Docker on macOS has no GPU) and point
the builder at the host:

    OLLAMA_CONTEXT_LENGTH=8192 ollama serve      # Ollama's default context is too small
    ollama pull qwen3:14b
    TB_ASSISTANT_URL=http://host.docker.internal:11434/v1 docker compose up -d builder

**Writing prompts for it.** A small model does well with exact locations and
explicit rules, and badly with vague requests. `.claude/skills/tersect-dataset-prompt/SKILL.md`
teaches a stronger model (Claude Code loads it as a skill; for any other LLM,
paste the file in) to find and verify the data and write the prompt to paste
into the panel, with a template and worked examples.

**Tools.** Read: `read_paper` (Crossref metadata; Europe PMC full text for
open-access papers: data availability, methods excerpts, supplementary files,
inline tables; otherwise the landing page or PDF, which many publishers
refuse to automated clients, then the Europe PMC abstract), `list_directory`
(HTTP index pages and FTP), `read_table` (CSV, TSV, XLSX, also inside a zip
as `url#member`, such as Europe PMC's supplementary archive), `check_urls`.
Propose: `propose_reference`, `propose_accessions`, `propose_rename_map`
(computed from the form's VCF contigs and reference sequences by chromosome
number when it can be), `propose_options`, `propose_sheet`. All fetches go
through the SSRF guard with size and time limits; results are short,
sectioned text, labelled so that the model can cite them.

**Limits.** At most 12 rounds of tool calls per turn, 6 calls per round;
malformed calls are answered with the validation error and the model may try
again. Thinking is turned off and any `<think>` output is removed before it
is streamed. Models that cannot call tools get a clear error. Tests use a
fake model server: `pytest tests/test_assistant.py` (`TB_NETWORK_TESTS=1`
also reads real papers and folders).

## Towards uploads from the UI

The pieces an upload feature needs are in place: a manifest is the job
description, `validate` is the input check, builds are recorded in MongoDB,
publishing is atomic, and the builder service above takes uploads and runs
builds. Still to do:

- ownership and visibility of datasets (uploads and drafts are not per user yet)

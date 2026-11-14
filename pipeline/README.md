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

**Normalise** (`genomics.normalise_sample`): select the sample, keep the chosen
chromosomes, drop existing annotations, split multi-allelic sites and
left-align indels against the reference. Sites whose REF disagrees with the
reference are dropped and counted. Then keep only sites where the accession
carries the alternative allele, and rename the sample to the manifest name.
Contig names that do not match the reference fail here, with both lists in
the message.

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

## Towards uploads from the UI

The pieces an upload feature needs are in place: a manifest is the job
description, `validate` is the input check, builds are recorded in MongoDB,
and publishing is atomic. Still to do:

- an upload endpoint that stores files under a per-user directory and writes
  a manifest there (`TB_PIPELINE_ALLOWED_ROOTS` confines it)
- a job queue: one worker container running `tb-dataset build`, polling
  `dataset_builds`
- progress over SSE, from the step logs
- ownership and visibility of datasets

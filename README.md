# Tersect Browser

Interactive exploration of genetic distances between resequenced accessions,
with phenetic trees, a genome browser (JBrowse 2), variant search, barcode
generation and automated introgression detection.

| Directory | |
|---|---|
| `web/` | React frontend ([web/README.md](web/README.md)) |
| `backend/` | Express API (Node 26), and the analysis scripts it runs (`backend/src/scripts`) |
| `pipeline/` | Dataset pipeline: builds datasets from VCF files ([pipeline/README.md](pipeline/README.md)) |
| `datasets/` | Dataset manifests |
| `clickhouse/` | Schema of the variant search store |
| `common/` | Types shared by backend and frontend |
| `docs/`, `HANDOFF.md` | Design brief and design-system handoff |

## Running with Docker

```sh
./start_all.sh
```

Then open http://localhost:4200/TersectBrowserGP/

This starts MongoDB, ClickHouse, the backend (with the analysis toolchain:
Tersect, rapidNJ, ASTRAL, PhyloNet, Julia and R) and the web app, and builds
the datasets listed in `DATASETS` (by default the bundled soybean index and
eight accessions of the Aflitos et al. tomato panel).

- **First run:** builds the `tersect-base` image (about 15 minutes on Apple
  Silicon, where it builds for amd64 under emulation) and downloads the
  datasets' inputs (about 1 GB). Later runs reuse both, and datasets that
  are already built are skipped. `docker compose up -d` starts the stack
  again.
- **Data:** kept in `test-data/` (gitignored): MongoDB in
  `test-data/docker-db`, ClickHouse in `test-data/clickhouse`, dataset files
  in `test-data/mongo-data`.
- **Development:** the repository is mounted into the containers, so changes
  to `backend/` and `web/src` reload without rebuilding.
- **Configuration:** `start_all.sh` creates `tbconfig.json` from
  `tbconfig.example.json` if it is missing. Inside the containers, database
  and data paths come from the `TB_*` variables in `docker-compose.yml`.
- **Ports:** web 4200, backend 4300, MongoDB `127.0.0.1:27018`, ClickHouse
  `127.0.0.1:8123`.

## Datasets

A dataset is described by a manifest naming its reference FASTA, gene models
and one VCF per accession (paths or URLs):

```sh
./scripts/dataset validate datasets/tomato-sl250.yaml
./scripts/dataset build datasets/tomato-sl250.yaml
./scripts/dataset status
```

The pipeline normalises the VCFs, builds the Tersect index, annotates
variants with snpEff, loads them into ClickHouse for variant search,
prepares the genome browser files and registers the dataset. See
[pipeline/README.md](pipeline/README.md) for the manifest format and how it
works. `datasets/tomato-sl250-accessions.tsv` maps the SGN VCF files of the
tomato panel to accession names.

## Development without Docker

The backend needs MongoDB 8, ClickHouse (with `clickhouse/schema.sql`
applied) and, on the `PATH`, `tersect`, `rapidnj`, `bcftools`, `tabix`,
`samtools` and a Python with `backend/src/scripts/requirements.venv.txt`.
Introgression analysis also needs the conda environment from
`environment.yml` (set `TB_ANALYSIS_PYTHON` to its Python), PhyloNet and
Julia; `Dockerfile.base` shows the full setup.

```sh
cp tbconfig.example.json tbconfig.json   # then adjust mongoHost and localDbPath
npm install                              # backend and web dependencies
npm run dev                              # backend on 4300, web on 4200
```

The backend reads ClickHouse settings from `TB_CLICKHOUSE_HOST`,
`TB_CLICKHOUSE_PORT`, `TB_CLICKHOUSE_USER` and `TB_CLICKHOUSE_PASSWORD`.
Datasets can be built locally with the pipeline's environment
(`pipeline/environment.yml`):
`PYTHONPATH=pipeline python -m tbpipeline.cli build datasets/<name>.yaml`.

rapidNJ uses SSE2 instructions; on Apple Silicon build it under Rosetta
(`arch -x86_64 make`), or use Docker.

## Production build

```sh
npm run build      # web app into dist/frontend, backend into dist/
npm run deploy     # serves both on serverPort
```

## Checks

```sh
npm run typecheck
npm run lint
```

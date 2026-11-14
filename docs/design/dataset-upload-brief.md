# Tersect Browser — Dataset upload: design brief

Screens for adding a dataset from the browser. Use the existing design system:
`tersect-theme.css` tokens, IBM Plex Sans / Mono, dense controls, and the
components already specified in HANDOFF.md (dialogs, the drawer, the
introgression job stepper). This brief covers the screens and every state the
pipeline can be in; the API it names does not exist yet and is built after the
design.

---

## 1. What a dataset is

A dataset is a set of **accessions** (plant lines, varieties, wild relatives)
compared against one **reference genome**. It is built from:

| Input | Required | Typical size | Notes |
|---|---|---|---|
| Reference FASTA (`.fa`, `.fa.gz`) | yes | 0.3–15 GB | Defines the chromosomes. |
| Gene models (GFF3) | no | 10–200 MB | Gene track, gene search, variant effects. |
| One VCF per accession, or one multi-sample VCF | yes (≥ 2 accessions) | 0.1–5 GB each | `.vcf.gz`. Sample names inside the file are matched to accessions. |
| Accession sheet | no | small | Label, group (e.g. species), free-form info columns. |

Every file can be **uploaded**, given as a **URL** (http/https/ftp), or picked
from a **server folder** (for large files already on the machine). Many users
will use URLs: public data lives at SGN, Ensembl Plants, ENA, LegumeInfo, etc.

Alternative path (advanced): an existing **Tersect index** (`.tsi`) instead of
VCFs. No variant search in that case.

### Options

| Option | Values | Default |
|---|---|---|
| Dataset name | free text, ≤ 100 chars | — |
| Description | free text | empty |
| Reference id | short name, e.g. `SL2.50` | from the FASTA file name |
| Chromosomes to include | subset of the FASTA's sequences | all (suggest dropping unplaced scaffolds like `ch00`, `scaffold_*`) |
| Variant effects | Build from GFF · Prebuilt snpEff database (name) · None | Build if a GFF is given |
| Distance index | Variant types: SNPs · Indels · Both; Homozygous only: on/off | Both, off |

Accession names must match `[A-Za-z0-9][A-Za-z0-9._-]*` (≤ 100). Labels are
free text and are what users see. Validate names inline and offer an
auto-fix (replace other characters with `_`).

---

## 2. Flow

Entry points: a **"New dataset"** button on Home (next to the dataset list),
and an empty state on Home when there are no datasets.

A full-page wizard (not a dialog — it holds tables of accessions), with a step
rail on the left and a persistent summary on the right. Steps can be revisited
until the build starts.

1. **Reference** — FASTA (required) and GFF (optional). After the FASTA is
   available the server reads its index and returns the sequence list with
   lengths; show it as a checklist with lengths in mono, a "select main
   chromosomes" shortcut, and a warning if > 100 sequences are selected.
2. **Accessions** — add VCFs (drop zone accepting many files, URL list paste,
   or server folder). Each VCF is inspected and its sample names listed. Show
   an editable table: name · label · group · source file · sample in file ·
   status. A multi-sample VCF expands to one row per sample (with a "select
   samples" control). Paste or upload an accession sheet (CSV/TSV) to fill
   label/group/info by name. Groups get colours from the existing group palette.
3. **Options** — variant effects and distance index (section 1). Short
   explanations, collapsed "Advanced".
4. **Review** — the full manifest summarised; the server validates it
   (section 4). Errors link back to the step and row. Secondary action:
   "Download manifest (YAML)" for command-line users. Primary: **Build
   dataset**.
5. **Build** — progress (section 3). The user may leave; the build continues
   and shows on Home.
6. **Done** — "Open in browser" (goes to the dataset's plot), plus build
   summary: accessions, variants, chromosomes, time taken.

### Uploads

Files are large. Requirements for the upload UI:
- Per-file progress, speed, and remaining time; overall progress.
- Resumable: a dropped connection or closed tab resumes, not restarts.
- Pause / cancel / remove per file.
- Files can upload while the user continues filling the form; the Build button
  waits for them.
- Checksums are computed server-side; show "verified" after upload.
- Show the server's free space and a warning when the upload would exceed it.

---

## 3. Build progress

The build runs as a sequence of steps; per-accession and per-chromosome steps
run in parallel. Present these user-facing stages (each maps to pipeline
steps):

| Stage | Pipeline steps | Granularity to show |
|---|---|---|
| Fetching files | download of URLs | per file, bytes |
| Preparing reference | FASTA index, chromosome list, gene models | — |
| Checking accessions | normalise (one per accession) | n / N accessions |
| Building distance index | Tersect index | — |
| Annotating variants | snpEff database, annotate (one per chromosome) | n / N chromosomes |
| Loading search tables | variant + gene tables, staging | — |
| Publishing | genome browser files, swap in | — |

Reuse the introgression job stepper pattern (numbered circles, check when
done, spinner when active, red cross on failure) but vertical, with the
sub-counts beside each stage and elapsed time per stage. Below: a collapsible
**log** (mono, tail-follow) for experts.

States to design:
- **Queued** (another build is running; position in queue).
- **Running** (the above).
- **Failed** — the stage turns red; show the error message in plain words
  (the pipeline already produces readable messages, examples below), the
  affected accession or chromosome, and actions: **Fix and retry** (back to
  the wizard with the problem highlighted) and **Retry** (resumes; finished
  steps are kept, so retries are fast — say so).
- **Cancelled**.
- **Succeeded**.
- **Rebuilding** an existing dataset (adding accessions): the current version
  stays visible to users until the new one is published.

Real error messages to design around:
- `No variants left for S_lyc_LA2706 on the chosen chromosomes. Do the VCF
  contig names (chr1, chr2, …) match the reference (SL2.50ch01, …)?` — the most
  common one; offer a contig-renaming map as the fix.
- `Sample "X" is not in file.vcf.gz (it has: A, B, C)` — offer a picker.
- `Chromosomes not in the reference FASTA: …`
- `The GFF has no features on the chosen chromosomes` — usually a naming
  mismatch between GFF and FASTA.
- `Download failed after 3 attempts: <url>`.

Builds take minutes for a few accessions and hours for hundreds; never imply
a precise ETA before the first stages finish.

---

## 4. Validation (Review step and inline)

Inline, as the user types or files arrive:
- Name rules; duplicate accession names.
- At least two accessions.
- Each VCF has a genotype column; the chosen sample exists in it.
- VCF contig names vs. selected chromosomes (show the mismatch and the
  suggested rename mapping).
- GFF sequence names vs. FASTA.
- "Variant effects: Build" needs a GFF.

On Review, the server runs the full validation (same rules as the command-line
`tb-dataset validate`) and returns a list of `{field, row?, message}`.

---

## 5. Home: dataset management

Add to each dataset card on Home: status badge (Ready · Building n% · Failed),
and a menu: Open, Add accessions (opens the wizard pre-filled), Rebuild,
Download manifest, Delete (confirmation naming the dataset; deleting removes
it from the browser, files on disk are kept).

A **Builds** page (or drawer) lists recent builds: dataset, status, started,
duration, who started it, and links to the build view.

---

## 6. Dataset assistant (optional panel)

A chat panel docked to the right of the wizard that helps fill the form. It
never builds anything itself: it **proposes** values, which appear in the form
highlighted as "suggested" until the user accepts them, and the server's
validation stays the authority.

Use cases to design for:
- **Replicate a paper.** The user pastes a DOI or paper link. The assistant
  reads the data-availability section and supplementary tables, finds the
  reference assembly and the per-accession VCF locations, and proposes the
  reference, the accession table (names, labels, species as groups) and the
  options. Every proposed URL is checked before it is shown (show
  reachable / not found / size per link).
- **Explain an error.** On a failed build, "Ask the assistant" explains the
  error and proposes the fix (e.g. a contig rename map).
- **Fill the accession sheet** from a pasted table in any shape.
- **Answer questions** about options ("should I use homozygous only?").

Design elements:
- Message list; assistant messages can contain **proposal cards** ("Set
  reference to SL2.50 from solgenomics.net — Apply / Dismiss"; "Add 84
  accessions — Review").
- Source citations under proposals (paper section, table, link).
- A visible note that the assistant runs on the server (a local open-weight
  model) and nothing leaves the machine — important for companies with
  private data.
- When the assistant is not configured, the panel is absent; the wizard works
  without it.

Limits to communicate: papers often publish raw reads, not VCFs. In that case
the assistant says so and lists what would be needed (alignment and variant
calling are outside this pipeline today).

### Principles

The design must make these visible:

- **The model fills in the form, never acts on its own.** Its output is
  structured data that maps onto the manifest fields, not free-form actions.
  Nothing it suggests takes effect until the user accepts it.
- **Validation has the final say.** Accepted suggestions go through the same
  inline checks and Review step as typed values; a wrong suggestion fails
  exactly like a typo. The Review and Build steps look the same whether or not
  the assistant was used.
- **Every link is checked before it is shown.** Models invent plausible
  download URLs, so each proposed URL is fetched (headers only) first; show
  reachable / not found / size beside it, and never offer "Apply" on a link
  that failed.
- **Show where each value came from** (paper section, table, row or link), so
  the user can verify it.
- **Runs locally.** The model is an open-weight model served on the same
  server (for example through Ollama or vLLM in its own container). No paper,
  file name or genotype is sent to an outside service, which matters to
  breeding companies with proprietary data. Say this in the panel.

### Why paper replication matters most

Reading a paper's data-availability statement and supplementary tables to find
the reference assembly, the accession list and the file locations takes an
afternoon; the assistant turns it into one review step. The catch: most papers
publish raw reads (FASTQ) rather than VCFs. Aflitos et al. (2014) were unusual
in providing per-accession VCFs on SGN. Replicating most papers needs
alignment and variant calling before the current pipeline (an established
workflow such as nf-core/sarek); until that exists, the assistant states that
the paper provides reads only and what it would take, rather than proposing an
incomplete dataset.

Other uses (smaller payoff): explaining build errors with a concrete fix, and
turning a pasted accession table of any shape into labels and groups.

Reading PDFs and supplementary spreadsheets is the least reliable part;
design the proposal cards so partial results are normal (e.g. "Found 84
accessions, 79 with VCF links; 5 need a location").

---

## 7. Proposed API (for reference)

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/uploads` (tus protocol) | resumable file upload |
| POST | `/api/datasets/inspect` | file → sequences (FASTA), samples + contigs (VCF), seqids (GFF) |
| POST | `/api/datasets/validate` | manifest → errors |
| POST | `/api/builds` | start a build from a manifest → build id |
| GET | `/api/builds/:id` (+ SSE stream) | stage, counts, log tail, error |
| POST | `/api/builds/:id/cancel`, `/retry` | |
| DELETE | `/api/datasets/:id` | |
| POST | `/api/assistant` (SSE) | chat; returns messages and proposals |

Build state already recorded by the pipeline per build: dataset id, manifest,
status (`running`, `succeeded`, `failed`), started/finished time, duration,
accession count, error.

---

## 8. Deliverables requested

Light and dark, 1440 and 1024 widths:
1. Home with "New dataset", status badges, empty state.
2. Wizard steps 1–4, including: FASTA sequence checklist; accession table with
   a multi-sample VCF expanded; uploads in progress (one paused, one failed);
   contig-mismatch inline error with the rename map; Review with errors.
3. Build view: running, failed (with Fix and retry), succeeded.
4. Assistant panel: paper-replication conversation with proposal cards and
   link checks; error explanation.
5. Builds list.

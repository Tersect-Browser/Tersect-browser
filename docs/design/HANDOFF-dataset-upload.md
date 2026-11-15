# Tersect Browser — dataset upload: implementation spec

Scope: adding a dataset from the browser. Home dataset management, the New dataset wizard, the build view, the Builds page and the optional dataset assistant. Light and dark themes, 1440 and 1024 widths.

This file stands alone. The rest of the app (design system, Browser screen, analysis panels) is specified in `HANDOFF.md`. The brief it answers is `dataset-upload-brief.md`.

The design prototype (`TersectDatasets.dc.html`, with `Tersect Upload Flow` and `Tersect Upload Screens`) is not in the repository. Section ids such as 2c and 7a refer to its artboards. Its data is invented. Where this spec and the prototype disagree, this spec wins.

## Stack and foundations

React, shadcn/ui (latest), Tailwind CSS v4, Radix primitives, lucide-react. IBM Plex Sans for UI; IBM Plex Mono for file names, accession names, sequence names, sizes, counts and times.

- Base text 12px / 1.35; table and helper text 11px; captions 10px uppercase with 0.06em tracking; step titles 15px / 600; dialog titles 14px / 600.
- Controls 26px by default, 24px in panels and footers, 20–22px in table rows. Table rows 20–24px.
- Radius 4px controls, 6px cards and popovers, 8px dialogs. Focus: 1px `--ring` border plus a 2px halo at 30%.
- Dialogs: `--popover` surface, 1px `--border`, scrim black at 45%, header with title and close, footer with a 1px top border and the primary action last.
- Colour roles used here:
  - Primary action, done, selected: `--primary`, `--accent`.
  - Blocking problem: `--destructive`, with a 6–8% tint as the alert background.
  - Caution that does not block (too many sequences, no variant search): `--viz-variant` amber border with a 10% tint.
  - Assistant suggestions: dashed `--ring` border on a 60% `--accent` tint, with a "SUGGESTED" badge on `--primary`.
  - Group swatches: `--group-1…19`.
- Sizes are shown as `247 MB`, `1.1 GB`; counts with thousands separators; durations as `6 min 12 s`, `2 h 41 min`.

## API

Implemented by the builder service (`pipeline/tbpipeline/server`), served under `<base>/api`. Shapes: `web/src/features/datasets/types.ts`; client: `web/src/features/datasets/api.ts`.

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/uploads` (tus protocol) | Resumable file upload |
| POST | `/api/datasets/inspect` | File → sequences (FASTA), samples and contigs (VCF), seqids (GFF) |
| POST | `/api/datasets/validate` | Manifest → `{field, row?, message}[]` |
| POST | `/api/builds` | Start a build from a manifest → build id |
| GET | `/api/builds/:id` (+ SSE stream) | Stage, counts, log tail, error |
| POST | `/api/builds/:id/cancel`, `/retry` | |
| DELETE | `/api/datasets/:id` | |
| POST | `/api/assistant` (SSE) | Chat; returns messages and proposals |

---

## 1. Entry points and Home (1a–1d)

- Header row above the dataset list: caption, **Builds** (outline, `history`), **New dataset** (primary, `plus`).
- Columns: Dataset (name, description), Reference, Accessions, Status, actions menu.
- Status badge, 20px pill: Ready (`--accent`), Building n% (`--secondary` with spinner and a 3px bar beneath), Failed (destructive tint), Draft (`--muted`, with a Resume link beneath).
- Actions menu (`ellipsis`): Open, Add accessions, Rebuild, Download manifest, separator, Delete (destructive).
- Delete: alert dialog naming the dataset. "It will be removed from the browser, along with its shared links. Files on disk are kept."
- Empty state: dashed box, `database` icon, "No datasets yet", one line on what a dataset is, primary New dataset.
- Ways into the wizard: New dataset → step 1 empty; Draft · Resume → the step last edited; Add accessions → step 2 in add mode (section 7).

## 2. Wizard shell

Full page under the top bar. Three columns:

- **Step rail**, 184px, `--sidebar`. Six steps: Reference, Accessions, Options, Review, Build, Done. 20px numbered circle; done = `--primary` fill with check; current = `--primary` outline and `--sidebar-accent` row; a `circle-alert` marks a step with errors. Steps 1–4 are clickable until the build starts. Beneath: server storage (bar, free of total, estimated need).
- **Main**: 44px header (step n of 6, title, Assistant toggle if configured), scrolling body, footer (Back or Cancel, hint text, Continue; on Review: Download manifest and Build dataset).
- **Summary**, 236px, `--card`: dataset, reference, gene models, accessions and group swatches, variant effects, distance index, overall upload progress.

Below 1200px the rail collapses to 48px (numbers only) and the summary becomes a 26px one-line mono strip under the header. The assistant panel is 340px (300px below 1200px).

The wizard autosaves as a draft. Continue is disabled, with the reason beside it, until the step's minimum is met (a FASTA; two accessions).

## 3. Step 1, Reference (6a, 2a, 6d)

- Dataset name (required, ≤ 100, live counter) and description.
- **Reference FASTA** (required) and **Gene models (GFF3)** (optional). Each has a three-way source switch: Upload, URL, Server folder.
  - Empty (6a): dashed drop zone with Browse. URL shows a single URL field with a Check button; Server folder opens the folder picker (section 5).
  - Filled: one file row — source icon, file name (mono), location, size, state badge, remove. States: uploading (bar, percent, speed, time left, pause, cancel), paused, failed (Retry resumes), verified, "Reachable, index read" for URLs.
- Reference id: mono input, prefilled from the FASTA file name.
- **Chromosomes to include**: appears once `/api/datasets/inspect` returns. 20px rows: checkbox, sequence name (mono), length (mono, right-aligned), proportional length bar. Controls: Select main chromosomes, All. Unplaced sequences (`ch00`, `scaffold_*`) are unchecked by default with a muted note.
- More than 100 selected (6d): amber alert stating the count and a primary "Select main chromosomes (n)". The list virtualises and collapses the tail into "n more sequences".

## 4. Step 2, Accessions (6b, 2b, 2c)

- **Add bar**: dashed drop zone for many `.vcf.gz` files, with Browse, Paste URLs, Server folder, and Accession sheet. The empty state (6b) is the same zone, larger, above an empty table.
- **Uploads panel** (collapsible): header with totals, overall bar and a loose time estimate. One 28px row per file: state icon, name, bar, status text (truncates; full text on hover), pause/resume/retry, remove. A footer line states that uploads resume, that the form can be filled meanwhile, and that checksums are verified on the server. Warn when the pending uploads exceed free space.
- **Table**: Name, Label, Group, Source file, Sample, Status, remove. Name and label edit in place; group is a combobox with a swatch from `--group-1…19`.
  - A multi-sample VCF is a header row (file, "n of m samples selected", Select samples) followed by one indented row per selected sample.
  - Invalid name: destructive border on the cell and a message row beneath with a one-click fix ("Use S.hab_LA1777"). Also flag duplicates and fewer than two accessions.
- **Contig mismatch** (2c): destructive alert naming the files, the VCF contig names and the reference names, with a rename map (VCF contig → reference sequence select, prefilled by chromosome number), "Apply to all n files with these contig names", and Apply rename map. Affected rows show "Contig mismatch". After applying, a one-line confirmation with Edit replaces the alert.

## 5. Step 2 dialogs (7a–7e)

- **Paste URLs** (7a), 520px: textarea, one link per line. Each link is checked (headers only) and listed as reachable with size, or not found (struck through, destructive). The primary button counts only reachable links.
- **Server folder** (7b), 540px: breadcrumb path, 24px rows with checkbox, icon, name (mono) and size; non-VCF files are muted. Footer shows count and total size. Only folders the server shares are listed; files are read in place.
- **Accession sheet** (7c), 660px: Paste or Upload tabs; detected format; a column-mapping row (sheet column → Name, Label, Group, Info column); preview table with a Match column. Footer: matched count and unused rows; "Apply to n accessions".
- **Select samples** (7d), 380px: file name, filter, checklist of sample names, "n of m selected".
- **Leave** (7e), 420px: shown on Cancel or when navigating away with unsaved work. States that a draft is kept and uploads pause and resume. Actions: Discard draft (destructive text), Keep editing, Save draft and leave (primary).

## 6. Steps 3 and 4 (2d, 6c, 6e, 2e)

- **Variant effects**: three radio cards — Build from GFF, Prebuilt snpEff database (name input), None. Without a GFF, Build is disabled with the reason and None is selected (6c).
- **Distance index**: Variant types (SNPs / Indels / Both), Homozygous only switch with a one-line explanation.
- **Advanced** (collapsed): "Use an existing Tersect index (.tsi) instead of VCFs". When on (6e): a file row for the index, an amber note that there is no variant search, and variant effects forced to None. Step 2 then lists the samples in the index for labels and groups.
- **Review**: the server validates the manifest and returns `{field, row?, message}`. Errors are listed in a destructive-bordered block, each with the field, the message and a link to the step and row. Below: Reference, Options and Accessions summaries, each with Edit. Footer: Download manifest (YAML); Build dataset, disabled with a reason while there are errors, and waiting on uploads otherwise.

## 7. Add accessions to an existing dataset (6f)

Opens the wizard at step 2 titled "Add accessions". Existing accessions are one locked row ("84 existing accessions. Unchanged."). Reference and options keep the published values. The build runs as Rebuilding (3f): the current version stays available until the new one is published.

## 8. Build and Done (3a–3f)

- Header: dataset name, status badge, elapsed time, Cancel build.
- Vertical `JobStepper`, seven stages: Fetching files, Preparing reference, Checking accessions, Building distance index, Annotating variants, Loading search tables, Publishing. Each row: marker, name, sub-count (mono), elapsed time (mono). The active stage with a count shows a 3px bar. Marker states are in the table below.
- Collapsible log: mono, tail-follow while running, error lines in destructive.

| Stage state | Marker (18px circle) | Label |
|---|---|---|
| Done | `--primary` fill, `check` | regular |
| Active | `--primary` outline, spinner | 600 |
| Failed | `--destructive` fill, `x` | 600, destructive |
| Cancelled | `--muted` fill, `ban` | regular |
| To do | `--input` outline, stage number in mono | muted |

- **Queued**: note with queue position and the build ahead.
- **Running**: note that the page can be left. No remaining-time estimate until the long stages have progressed.
- **Failed**: destructive card with the stage, the pipeline's message, the affected accession or chromosome and file, and three actions — Fix and retry (opens the wizard at the problem), Retry (resumes; say that finished steps are kept), Ask the assistant (if configured).
- **Cancelled**: note naming the stage; Resume build, Back to review.
- **Succeeded** (step 6): four figures — accessions, variants, chromosomes, time taken — with Open in browser (primary) and Download manifest.
- **Rebuilding**: note that the current version stays available.

## 9. Assistant (4a–4e)

Absent when not configured. Docked right of the wizard.

- Header, then a fixed privacy line: runs on this server with a local open-weight model; nothing leaves the machine; it fills in the form and cannot start a build.
- Empty state: three starter prompts.
- Messages: user messages right-aligned on `--secondary`; assistant text unboxed.
- **Proposal card**: title, one-line note, checked links (reachable with size, or struck through "not found"), a Source line, then Apply/Review and Dismiss. Partial results are stated in the note ("79 with VCF links; 5 need a location"). A card with no reachable link offers no Apply. After acting, the buttons are replaced by a status line.
- Applied proposals land in the form as a dashed, tinted "SUGGESTED" block (or tinted rows with a SUGGESTED badge) with the source and Accept / Dismiss. They are not part of the manifest until accepted, and then go through the same validation as typed values.
- Reads-only papers: the assistant says so, lists what would be needed, and proposes no dataset.

## 10. Builds page (5a)

Table: Dataset, Status (badge plus stage or detail), Started, Duration, Started by, View. Rows open the build view. A line under the title: "One build runs at a time. Others wait in the queue."

## Open items

- URL and Server-folder variants of the FASTA and GFF source switch are specified here but only the Upload and URL-filled states are drawn.
- Drafts are stored on the server (the app has no accounts), so every user of a server sees every draft.
- "Started by" without accounts: the builder records a forwarded user header when a proxy sets one, otherwise nothing.

## Acceptance

- Both themes pass on every screen at 1440 and 1024. Below 1200px the rail is 48px and the summary is the one-line strip; nothing overlaps or clips with the assistant open.
- No hard-coded colours; everything comes from tokens.
- Uploads survive a dropped connection, a reload and a closed tab, and resume from where they stopped.
- The user can move between steps 1–4 while uploads run; Build dataset waits for them and says so.
- Inline validation fires as the user types or as files arrive: name rules and duplicates, at least two accessions, sample present in its VCF, VCF contigs and GFF sequence names against the reference, and "Build from GFF" needing a GFF. Review shows the server's list and each error links to its step and row.
- A failed build names the stage, the message and the affected accession or file; Retry resumes at the failed stage.
- No remaining-time estimate is shown before the long stages have progressed.
- Leaving mid-wizard keeps a draft; Resume returns to the step last edited.
- Assistant suggestions never enter the manifest without Accept; a link that failed its check has no Apply.
- With the assistant not configured, the toggle and panel are absent and nothing else changes.

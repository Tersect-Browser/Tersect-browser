/**
 * Contract between the dataset upload UI (web/src/features/datasets) and the
 * builder service (/api, pipeline/tbpipeline/server). Field names are
 * snake_case where they come from the server.
 */

/* ------------------------------------------------------------- files -- */

export type FileSource = "upload" | "url" | "server"

/**
 * Where an input file is. `location` is the tus upload id for "upload", the
 * URL for "url" and the absolute server path for "server".
 */
export interface FileRef {
  source: FileSource
  location: string
  /** File name shown in the UI (last path or URL segment). */
  name: string
  /** Bytes, when known. */
  size?: number | null
}

export type FileKind = "fasta" | "gff" | "vcf" | "tsi"

export interface SequenceInfo {
  name: string
  length: number
}

/** POST /api/datasets/inspect → what the server read from a file. */
export interface InspectResult {
  kind: FileKind
  size: number | null
  /** FASTA: sequences with lengths (null when the index cannot be read yet). */
  sequences?: SequenceInfo[] | null
  /** VCF and TSI: sample names. */
  samples?: string[] | null
  /** VCF: contig names in the header or records. */
  contigs?: string[] | null
  /** VCF: whether a FORMAT/GT column exists. */
  has_genotypes?: boolean | null
  /** GFF: sequence ids with features. */
  seqids?: string[] | null
  /** Human-readable note, e.g. "Sequences are listed once the file is downloaded". */
  note?: string | null
  /** Set when the file could not be read; the message is shown as is. */
  error?: string | null
}

/** POST /api/datasets/check-urls → one per URL (HEAD request only). */
export interface UrlCheck {
  url: string
  ok: boolean
  /** HTTP status, or null for FTP / network errors. */
  status: number | null
  size: number | null
  /** e.g. "not found (404)". */
  error?: string | null
}

/** GET /api/server-files?path= */
export interface ServerFolder {
  /** Absolute path of this folder; "" for the list of shared roots. */
  path: string
  /** Parent folder, or null at a shared root. */
  parent: string | null
  entries: ServerEntry[]
}

export interface ServerEntry {
  name: string
  /** Absolute path. */
  path: string
  kind: "dir" | "file"
  size: number | null
}

/** GET /api/storage */
export interface StorageInfo {
  free: number
  total: number
}

/** GET /api/config */
export interface BuilderConfig {
  assistant: boolean
  /** Model the assistant runs on, e.g. "qwen3:8b" (shown in the panel). */
  assistant_model?: string | null
  /** Largest upload the server accepts, in bytes (null = no limit). */
  max_upload: number | null
}

/* ---------------------------------------------------------- manifest -- */

export type EffectsMode = "build" | "prebuilt" | "none"
export type VariantTypes = "snps" | "indels" | "both"

/**
 * The manifest sent to the server: the pipeline's YAML schema
 * (datasets/*.yaml) with file locations as FileRefs. Either `samples` or
 * `index` is set.
 */
export interface ManifestInput {
  id: string
  description?: string
  reference: {
    id: string
    fasta: FileRef | null
    gff?: FileRef | null
    chromosomes?: string[]
  }
  /** "build", "none" or a prebuilt snpEff database name. */
  annotation: { snpeff: string }
  tersect: { homozygous: boolean; types: VariantTypes }
  samples?: ManifestSample[]
  index?: FileRef
}

export interface ManifestSample {
  name: string
  label: string
  group?: string
  vcf: FileRef
  vcf_sample?: string
  info?: Record<string, string>
  /** VCF contig → reference sequence (bcftools annotate --rename-chrs). */
  rename_contigs?: Record<string, string>
}

/** POST /api/datasets/validate → { errors } */
export interface ValidationIssue {
  /** Manifest path, e.g. "samples[4].name", "reference.fasta". */
  field: string
  /** Index into samples, when the issue is about one sample. */
  row?: number | null
  message: string
}

/* ------------------------------------------------------------ drafts -- */

/** Wizard steps that hold form input (Build and Done are not drafts). */
export type WizardStep = "reference" | "accessions" | "options" | "review"
export const WIZARD_STEPS: WizardStep[] = [
  "reference",
  "accessions",
  "options",
  "review",
]

/** One VCF added in step 2. A multi-sample file has several samples. */
export interface VcfFile {
  id: string
  file: FileRef
  /** Filled by inspect; null while it runs. */
  samples: string[] | null
  contigs: string[] | null
  hasGenotypes: boolean | null
  inspectError: string | null
  /** Samples turned into accession rows (multi-sample files). */
  selected: string[]
  /** VCF contig → reference sequence, once a rename map is applied. */
  renameContigs: Record<string, string> | null
}

export interface AccessionRow {
  id: string
  name: string
  label: string
  group: string
  /** VcfFile.id */
  fileId: string
  sample: string
  info: Record<string, string>
}

export interface WizardForm {
  name: string
  description: string
  reference: {
    id: string
    fasta: FileRef | null
    gff: FileRef | null
    /** From inspect of the FASTA; null until read. */
    sequences: SequenceInfo[] | null
    /** Selected sequence names. */
    chromosomes: string[]
    /** GFF seqids from inspect, for the GFF/FASTA name check. */
    gffSeqids: string[] | null
  }
  vcfs: VcfFile[]
  accessions: AccessionRow[]
  options: {
    effects: EffectsMode
    snpeffDb: string
    types: VariantTypes
    homozygous: boolean
    useIndex: boolean
    index: FileRef | null
    /** Samples in the index, from inspect. */
    indexSamples: string[] | null
  }
}

/** Stored by the server (GET/PUT /api/drafts/:id) and listed on Home. */
export interface Draft {
  id: string
  /** "add" adds accessions to `base_dataset`; reference and options are locked. */
  mode: "new" | "add"
  base_dataset: string | null
  /** Accessions already in the base dataset (add mode). */
  base_accessions: number | null
  step: WizardStep
  form: WizardForm
  /** Set by the server when a build starts from this draft; such drafts are
   * not listed as Draft rows on Home. Deleted when the build succeeds. */
  build_id: string | null
  updated_at: string
}

/* ------------------------------------------------------------ builds -- */

export type BuildStatus =
  | "queued"
  | "running"
  | "failed"
  | "cancelled"
  | "succeeded"

export const BUILD_STAGES = [
  { key: "fetch", name: "Fetching files" },
  { key: "reference", name: "Preparing reference" },
  { key: "accessions", name: "Checking accessions" },
  { key: "index", name: "Building distance index" },
  { key: "annotate", name: "Annotating variants" },
  { key: "load", name: "Loading search tables" },
  { key: "publish", name: "Publishing" },
] as const

export type StageKey = (typeof BUILD_STAGES)[number]["key"]
export type StageStatus = "todo" | "active" | "done" | "failed" | "cancelled"

export interface BuildStage {
  key: StageKey
  status: StageStatus
  /** Sub-count, e.g. 7 of 12 chromosomes. */
  done?: number | null
  total?: number | null
  /** What done/total count, plural: "files", "accessions", "chromosomes". */
  unit?: string | null
  /** Free text beside the stage, e.g. "3 files · 3.7 GB", "kept from current version". */
  detail?: string | null
  /** Seconds spent in this stage so far. */
  elapsed?: number | null
}

export interface BuildError {
  stage: StageKey
  /** The pipeline's message, shown as is. */
  message: string
  accession?: string | null
  file?: string | null
  chromosome?: string | null
  /** What "Fix and retry" should open. */
  fix?: {
    step: WizardStep
    /** e.g. "rename-map", "sample", "fasta", "gff". */
    kind?: string | null
    /** Accession name or file name the fix applies to. */
    target?: string | null
  } | null
}

export interface BuildSummary {
  accessions: number
  variants: number | null
  chromosomes: number
  /** Seconds. */
  duration: number
}

export interface Build {
  id: string
  dataset_id: string
  status: BuildStatus
  /** Adding accessions to or rebuilding a published dataset. */
  rebuild: boolean
  /** Short line for lists, e.g. "adding 4 accessions". */
  description?: string | null
  /** 1-based position in the queue while queued. */
  queue_position?: number | null
  /** Dataset building now, while queued. */
  ahead?: string | null
  /** ISO timestamps. */
  created_at: string
  started_at: string | null
  finished_at: string | null
  /** Seconds since start (running) or total (finished). */
  elapsed: number | null
  started_by: string | null
  stages: BuildStage[]
  /** Last lines of the log; error lines flagged. */
  log: { t: string; error?: boolean }[]
  error?: BuildError | null
  summary?: BuildSummary | null
  /** View id for /share/:viewId once the dataset is published. */
  view_id?: string | null
  /** Draft the build came from ("Fix and retry" reopens it). */
  draft_id?: string | null
}

/* ---------------------------------------------------------- datasets -- */

export type DatasetStatus = "ready" | "building" | "failed"

/** GET /api/datasets: published datasets and their latest build. */
export interface ManagedDataset {
  id: string
  description: string | null
  reference: string
  accessions: number
  status: DatasetStatus
  /** 0–100 while building. */
  progress?: number | null
  build_id?: string | null
  /** View id used by /share/:viewId to open it in the browser. */
  view_id?: string | null
  /** The manifest can be downloaded and edited (built through the pipeline). */
  has_manifest: boolean
  /** Shown in the public dataset list (published datasets only). Unlisted
   * datasets still open from share links and stay on Home for management. */
  listed: boolean
}

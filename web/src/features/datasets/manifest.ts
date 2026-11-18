/**
 * Form state → manifest, and the inline checks the wizard runs as the user
 * types. The server's validation (Review step) is the authority; these give
 * early feedback with the same rules (pipeline/tbpipeline/manifest.py).
 */
import type {
  AccessionRow,
  ManifestInput,
  SequenceInfo,
  VcfFile,
  WizardForm,
  WizardStep,
} from "./types"

export const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/

/** Replace characters a name may not contain with "_". */
export function fixName(name: string): string {
  let fixed = name.trim().replace(/[^A-Za-z0-9._-]/g, "_")
  if (!/^[A-Za-z0-9]/.test(fixed)) fixed = `S${fixed}`
  return fixed.slice(0, 100)
}

/** Sequences that are not main chromosomes: ch00, unplaced, scaffolds, contigs. */
export function isUnplaced(name: string): boolean {
  return (
    /(^|[^0-9])0+$/.test(name) ||
    /scaffold|contig|unplaced|unloc|random|^un|chrun|_un$/i.test(name)
  )
}

/**
 * A numbered chromosome: "1", "chr01", "Chr10", "Gm01", "LG3", or a prefixed
 * assembly name ending in ch/chr/chromosome + number ("SL2.50ch01"). Not
 * scaffolds ("Syng_TIGR_041", "scaffold_12"), organelles ("Mt", "Pt") or 0.
 */
function isNumberedChromosome(name: string): boolean {
  return (
    (/^[A-Za-z]{0,3}_?0*[1-9]\d{0,2}$/.test(name) ||
      /(ch|chr|chromosome)_?0*[1-9]\d{0,2}$/i.test(name)) &&
    !isUnplaced(name)
  )
}

/**
 * "Select main chromosomes". When the FASTA has numbered chromosomes, those
 * are the main ones and everything else is left out: a name-based list of
 * unplaced sequences missed rice's Syng_TIGR_* scaffolds (Ensembl IRGSP-1.0),
 * selecting 63 sequences instead of 12. Otherwise, everything not unplaced.
 */
export function mainChromosomes(sequences: SequenceInfo[]): string[] {
  const numbered = sequences.filter((s) => isNumberedChromosome(s.name))
  if (numbered.length >= 2) return numbered.map((s) => s.name)
  return sequences.filter((s) => !isUnplaced(s.name)).map((s) => s.name)
}

/** Reference id suggested from the FASTA file name, e.g. "SL2.50". */
export function referenceIdFrom(fileName: string): string {
  const stem = fileName.replace(/\.(fa|fasta|fna)(\.gz)?$/i, "")
  const version = stem.match(/[A-Za-z]*\d+(\.\d+)+/)
  const id = version ? version[0] : stem
  return id.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 100)
}

/** Trailing number of a sequence name: chr1 → 1, SL2.50ch01 → 1. */
function chromosomeNumber(name: string): number | null {
  const match = name.match(/(\d+)$/)
  return match ? parseInt(match[1], 10) : null
}

/**
 * Suggested VCF contig → reference sequence map, matched by chromosome
 * number. Contigs that already match, or have no counterpart, are left out.
 */
export function suggestRenameMap(
  contigs: string[],
  reference: string[]
): Record<string, string> {
  const byNumber = new Map<number, string>()
  for (const name of reference) {
    const n = chromosomeNumber(name)
    if (n !== null && !byNumber.has(n)) byNumber.set(n, name)
  }
  const map: Record<string, string> = {}
  for (const contig of contigs) {
    if (reference.includes(contig)) continue
    const n = chromosomeNumber(contig)
    const target = n === null ? undefined : byNumber.get(n)
    if (target) map[contig] = target
  }
  return map
}

/** VCF contigs (after any rename) that hit none of the chosen chromosomes. */
export function hasContigMismatch(
  vcf: VcfFile,
  chromosomes: string[]
): boolean {
  if (!vcf.contigs || vcf.contigs.length === 0 || chromosomes.length === 0) {
    return false
  }
  const renamed = vcf.contigs.map((c) => vcf.renameContigs?.[c] ?? c)
  return !renamed.some((c) => chromosomes.includes(c))
}

export interface InlineIssue {
  step: WizardStep
  /** AccessionRow.id or VcfFile.id the issue is about. */
  target?: string
  kind:
    | "name"
    | "duplicate"
    | "too-few"
    | "sample"
    | "genotypes"
    | "contigs"
    | "gff-names"
    | "effects-needs-gff"
    | "fasta"
    | "dataset-name"
  message: string
}

export function accessionIssues(
  row: AccessionRow,
  all: AccessionRow[]
): InlineIssue[] {
  const issues: InlineIssue[] = []
  if (!NAME_PATTERN.test(row.name)) {
    issues.push({
      step: "accessions",
      target: row.id,
      kind: "name",
      message:
        "Names can use letters, digits, . _ - and must start with a letter or digit.",
    })
  }
  if (all.some((other) => other.id !== row.id && other.name === row.name)) {
    issues.push({
      step: "accessions",
      target: row.id,
      kind: "duplicate",
      message: `Another accession is also named "${row.name}".`,
    })
  }
  return issues
}

/** Every inline check, for the step rail markers and Continue gating. */
export function inlineIssues(form: WizardForm, addMode = false): InlineIssue[] {
  const issues: InlineIssue[] = []
  const { reference, options } = form

  if (!addMode) {
    if (!form.name.trim()) {
      issues.push({
        step: "reference",
        kind: "dataset-name",
        message: "Name the dataset.",
      })
    }
    if (!reference.fasta) {
      issues.push({
        step: "reference",
        kind: "fasta",
        message: "Add a reference FASTA.",
      })
    }
    if (
      reference.gffSeqids &&
      reference.chromosomes.length > 0 &&
      !reference.gffSeqids.some((s) => reference.chromosomes.includes(s))
    ) {
      issues.push({
        step: "reference",
        kind: "gff-names",
        message:
          "The GFF has no features on the chosen chromosomes. Its sequence names may not match the FASTA.",
      })
    }
    if (options.effects === "build" && !reference.gff) {
      issues.push({
        step: "options",
        kind: "effects-needs-gff",
        message: "Build from GFF needs gene models (step 1).",
      })
    }
  }

  if (!options.useIndex) {
    if (form.accessions.length < 2 && !addMode) {
      issues.push({
        step: "accessions",
        kind: "too-few",
        message: "At least two accessions are needed.",
      })
    }
    for (const row of form.accessions) {
      issues.push(...accessionIssues(row, form.accessions))
    }
    for (const vcf of form.vcfs) {
      if (vcf.hasGenotypes === false) {
        issues.push({
          step: "accessions",
          target: vcf.id,
          kind: "genotypes",
          message: `${vcf.file.name} has no genotype (GT) column.`,
        })
      }
      if (vcf.samples) {
        for (const row of form.accessions.filter((r) => r.fileId === vcf.id)) {
          if (!vcf.samples.includes(row.sample)) {
            issues.push({
              step: "accessions",
              target: row.id,
              kind: "sample",
              message: `Sample "${row.sample}" is not in ${vcf.file.name} (it has: ${vcf.samples.join(", ")})`,
            })
          }
        }
      }
      if (hasContigMismatch(vcf, reference.chromosomes)) {
        issues.push({
          step: "accessions",
          target: vcf.id,
          kind: "contigs",
          message: `${vcf.file.name} has no contigs named like the chosen chromosomes.`,
        })
      }
    }
  }
  return issues
}

/** The manifest the server validates and builds. */
export function toManifest(form: WizardForm): ManifestInput {
  const { reference, options } = form
  const snpeff = options.useIndex
    ? "none"
    : options.effects === "prebuilt"
      ? options.snpeffDb.trim()
      : options.effects
  const manifest: ManifestInput = {
    id: form.name.trim(),
    description: form.description.trim() || undefined,
    reference: {
      id: reference.id.trim(),
      fasta: reference.fasta,
      gff: reference.gff,
      chromosomes: reference.chromosomes.length
        ? reference.chromosomes
        : undefined,
    },
    annotation: { snpeff },
    tersect: { homozygous: options.homozygous, types: options.types },
  }
  if (options.useIndex && options.index) {
    manifest.index = options.index
    return manifest
  }
  const files = new Map(form.vcfs.map((v) => [v.id, v]))
  manifest.samples = form.accessions.flatMap((row) => {
    const vcf = files.get(row.fileId)
    if (!vcf) return []
    const multi = (vcf.samples?.length ?? 0) > 1
    return [
      {
        name: row.name,
        label: row.label || row.name,
        group: row.group || undefined,
        vcf: vcf.file,
        vcf_sample: multi || row.sample ? row.sample : undefined,
        info: Object.keys(row.info).length ? row.info : undefined,
        rename_contigs: vcf.renameContigs ?? undefined,
      },
    ]
  })
  return manifest
}

export function emptyForm(): WizardForm {
  return {
    name: "",
    description: "",
    reference: {
      id: "",
      fasta: null,
      gff: null,
      sequences: null,
      chromosomes: [],
      gffSeqids: null,
    },
    vcfs: [],
    accessions: [],
    options: {
      effects: "build",
      snpeffDb: "",
      types: "both",
      homozygous: false,
      useIndex: false,
      index: null,
      indexSamples: null,
    },
  }
}

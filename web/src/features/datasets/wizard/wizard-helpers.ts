/** Shared by the wizard shell, footer and steps. */
import { create } from "zustand"

import { formatCount } from "../format"
import type { FileRef, WizardForm, WizardStep } from "../types"
import { useDraftUploads, type UploadItem } from "../uploads"

export const STEP_TITLES: Record<WizardStep | "build" | "done", string> = {
  reference: "Reference",
  accessions: "Accessions",
  options: "Options",
  review: "Review",
  build: "Build",
  done: "Done",
}

/** All six rail steps, in order. */
export const RAIL_STEPS = [
  "reference",
  "accessions",
  "options",
  "review",
  "build",
  "done",
] as const

/** Below this container width the rail collapses and the summary is a strip. */
export const NARROW_WIDTH = 1200

/* --------------------------------------------------------- UI flags -- */

interface WizardUiState {
  assistantOpen: boolean
  toggleAssistant: () => void
}

/** View state that is not part of the draft. */
export const useWizardUi = create<WizardUiState>((set) => ({
  assistantOpen: false,
  toggleAssistant: () => set((s) => ({ assistantOpen: !s.assistantOpen })),
}))

/* ----------------------------------------------------------- groups -- */

export const groupColor = (index: number) => `var(--group-${(index % 19) + 1})`

/** Groups in order of first appearance, with counts and swatch colours. */
export function groupsOf(form: WizardForm) {
  const counts = new Map<string, number>()
  for (const row of form.accessions) {
    if (!row.group) continue
    counts.set(row.group, (counts.get(row.group) ?? 0) + 1)
  }
  return [...counts].map(([name, count], index) => ({
    name,
    count,
    color: groupColor(index),
  }))
}

/** "12 of 13 sequences", or null before the FASTA is read. */
export function sequenceSummary(form: WizardForm): string | null {
  const sequences = form.reference.sequences
  if (!sequences) return null
  return `${formatCount(form.reference.chromosomes.length)} of ${formatCount(sequences.length)} sequences`
}

/* ---------------------------------------------------------- uploads -- */

/** Every file the form refers to. */
export function formFiles(form: WizardForm): FileRef[] {
  const files: (FileRef | null)[] = [form.reference.fasta, form.reference.gff]
  if (form.options.useIndex) files.push(form.options.index)
  else files.push(...form.vcfs.map((v) => v.file))
  return files.filter((f): f is FileRef => f !== null)
}

/**
 * Uploads of this draft that the form still uses (a file removed from the
 * form no longer holds up the build).
 */
export function useFormUploads(
  draftId: string | undefined,
  form: WizardForm
): UploadItem[] {
  const items = useDraftUploads(draftId)
  const ids = new Set(
    formFiles(form)
      .filter((f) => f.source === "upload")
      .map((f) => f.location)
  )
  return items.filter((i) => i.uploadId !== null && ids.has(i.uploadId))
}

/* ---------------------------------------------------------- storage -- */

/**
 * Rough disk space a build needs, from the input sizes: the reference is
 * kept with its index and snpEff database (about twice its size), and each
 * VCF is normalised, annotated and loaded into the search tables (about three
 * times its size). Null when no size is known yet.
 */
export function estimateNeed(form: WizardForm): number | null {
  let known = false
  const size = (ref: FileRef | null | undefined) => {
    if (ref?.size == null) return 0
    known = true
    return ref.size
  }
  let need = 2 * size(form.reference.fasta) + 2 * size(form.reference.gff)
  if (form.options.useIndex) need += size(form.options.index)
  else for (const vcf of form.vcfs) need += 3 * size(vcf.file)
  return known ? need : null
}

/* --------------------------------------------------------- download -- */

export function downloadText(
  text: string,
  fileName: string,
  type = "text/yaml"
) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement("a")
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const plural = (n: number, one: string, many = `${one}s`) =>
  `${formatCount(n)} ${n === 1 ? one : many}`

/* ---------------------------------------------------------- options -- */

export function effectsLabel(form: WizardForm): string {
  const { options } = form
  if (options.useIndex || options.effects === "none") return "None"
  if (options.effects === "build") return "Build from GFF"
  return options.snpeffDb.trim()
    ? `snpEff database ${options.snpeffDb.trim()}`
    : "Prebuilt snpEff database"
}

const TYPE_LABELS = { snps: "SNPs", indels: "Indels", both: "SNPs and indels" }

export function distanceLabel(form: WizardForm): string {
  const { options } = form
  if (options.useIndex) return "Existing index (.tsi)"
  return `${TYPE_LABELS[options.types]}${options.homozygous ? ", homozygous only" : ""}`
}

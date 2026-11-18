/**
 * Helpers shared by step 2 (Accessions) and its dialogs: source icons, group
 * colours, and the form edits for adding and removing VCF files.
 */
import { FileIcon, HardDriveIcon, LinkIcon, UploadIcon } from "lucide-react"
import { toast } from "sonner"
import { create } from "zustand"

import { cn } from "@/lib/utils"

import { fileNameOf } from "../format"
import type {
  AccessionRow,
  FileRef,
  FileSource,
  VcfFile,
  WizardForm,
} from "../types"
import { useUploads } from "../uploads"
import { newId, useWizardStore } from "../wizard-store"

/** VCF file names step 2 accepts. */
export const VCF_PATTERN = /\.(vcf(\.b?gz)?|bcf)$/i
export const isVcfName = (name: string) => VCF_PATTERN.test(name)

/** Row file id for samples that come from a Tersect index (index mode). */
export const INDEX_FILE_ID = "index"

const GROUP_COUNT = 19

/** Groups in order of first use; the order picks the swatch colour. */
export function groupNames(rows: AccessionRow[]): string[] {
  const seen = new Set<string>()
  for (const row of rows) if (row.group) seen.add(row.group)
  return [...seen]
}

export function groupColor(
  groups: string[],
  group: string
): string | undefined {
  const index = groups.indexOf(group)
  return index < 0 ? undefined : `var(--group-${(index % GROUP_COUNT) + 1})`
}

export function GroupSwatch({
  color,
  className,
}: {
  color: string | undefined
  className?: string
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block size-2.5 shrink-0 rounded-[2px]",
        color ? "" : "border border-dashed border-input",
        className
      )}
      style={color ? { backgroundColor: color } : undefined}
    />
  )
}

const SOURCE_ICONS: Record<FileSource, typeof FileIcon> = {
  upload: UploadIcon,
  url: LinkIcon,
  server: HardDriveIcon,
}

export const SOURCE_LABELS: Record<FileSource, string> = {
  upload: "Uploaded",
  url: "URL",
  server: "Server folder",
}

export function SourceIcon({
  source,
  className,
}: {
  source: FileSource
  className?: string
}) {
  const Icon = SOURCE_ICONS[source]
  return (
    <Icon
      aria-label={SOURCE_LABELS[source]}
      className={cn("size-3 shrink-0 text-muted-foreground", className)}
    />
  )
}

/** "LA1777.vcf.gz" → "LA1777": the name a row has before its header is read. */
export function fileStem(name: string): string {
  return name.replace(/\.(vcf(\.b?gz)?|bcf)$/i, "") || name
}

/** Replace a file's rows, keeping their place in the table. */
export function replaceFileRows(
  rows: AccessionRow[],
  fileId: string,
  next: AccessionRow[]
): AccessionRow[] {
  const at = rows.findIndex((r) => r.fileId === fileId)
  const rest = rows.filter((r) => r.fileId !== fileId)
  if (at < 0) return [...rest, ...next]
  const before = rows.slice(0, at).filter((r) => r.fileId !== fileId).length
  return [...rest.slice(0, before), ...next, ...rest.slice(before)]
}

function newVcf(file: FileRef): VcfFile {
  return {
    id: newId("vcf"),
    file,
    samples: null,
    contigs: null,
    hasGenotypes: null,
    inspectError: null,
    selected: [],
    renameContigs: null,
  }
}

/** One row per file until its header is read; named after the file. */
function provisionalRow(vcf: VcfFile): AccessionRow {
  const stem = fileStem(vcf.file.name)
  return {
    id: newId("acc"),
    name: stem,
    label: stem,
    group: "",
    fileId: vcf.id,
    sample: "",
    info: {},
  }
}

const sameFile = (a: FileRef, b: FileRef) =>
  a.source === b.source && a.location === b.location

/** Add VCFs found by URL or on the server (no upload needed). */
export function addVcfRefs(refs: FileRef[]) {
  const { update } = useWizardStore.getState()
  update((form) => {
    const fresh = refs.filter(
      (ref) => !form.vcfs.some((v) => sameFile(v.file, ref))
    )
    const vcfs = fresh.map(newVcf)
    return {
      ...form,
      vcfs: [...form.vcfs, ...vcfs],
      accessions: [...form.accessions, ...vcfs.map(provisionalRow)],
    }
  })
}

export function addUrlRefs(urls: { url: string; size: number | null }[]) {
  addVcfRefs(
    urls.map(({ url, size }) => ({
      source: "url",
      location: url,
      name: fileNameOf(url),
      size,
    }))
  )
}

/**
 * Upload keys of local VCFs whose upload the server has not created yet
 * (their FileRef has no location), so their rows can show its state.
 */
export const usePendingUploads = create<Record<string, string>>(() => ({}))

/**
 * Add local files: each gets a VcfFile at once (so its row can be edited)
 * and its upload starts; the FileRef is filled in once the server created it.
 */
export function addLocalFiles(files: File[], draftId: string) {
  const { update, draft } = useWizardStore.getState()
  const existing = draft?.form.vcfs ?? []
  const accepted: File[] = []
  const skipped: string[] = []
  for (const file of files) {
    if (!isVcfName(file.name)) skipped.push(file.name)
    else if (
      existing.some(
        (v) =>
          v.file.source === "upload" &&
          v.file.name === file.name &&
          v.file.size === file.size
      )
    )
      skipped.push(file.name)
    else accepted.push(file)
  }
  if (skipped.length) {
    toast.warning(
      skipped.length === 1
        ? `${skipped[0]} was not added: it is already listed or is not a VCF.`
        : `${skipped.length} files were not added: already listed or not VCFs.`
    )
  }
  const vcfs = accepted.map((file) =>
    newVcf({ source: "upload", location: "", name: file.name, size: file.size })
  )
  if (!vcfs.length) return
  update((form) => ({
    ...form,
    vcfs: [...form.vcfs, ...vcfs],
    accessions: [...form.accessions, ...vcfs.map(provisionalRow)],
  }))
  accepted.forEach((file, i) => {
    const id = vcfs[i].id
    usePendingUploads.setState({
      [id]: `${file.name}:${file.size}:${file.lastModified}`,
    })
    void useUploads
      .getState()
      .add(file, draftId)
      .then(({ key, ref }) => {
        usePendingUploads.setState((pending) => {
          const next = { ...pending }
          delete next[id]
          return next
        }, true)
        const form = useWizardStore.getState().draft?.form
        if (!form?.vcfs.some((v) => v.id === id)) {
          // Removed before the server created the upload.
          useUploads.getState().remove(key)
          return
        }
        update((f) => ({
          ...f,
          vcfs: f.vcfs.map((v) => (v.id === id ? { ...v, file: ref } : v)),
        }))
      })
      // Failed before the server created it: the row keeps showing the
      // upload (via usePendingUploads) as failed, and Retry starts it again.
      .catch(() => {})
  })
}

/** Upload key of a VCF's (or any uploaded FileRef's) upload, if known. */
export function uploadKeyFor(
  ref: FileRef | null | undefined,
  vcfId?: string
): string | undefined {
  if (ref?.source !== "upload") return undefined
  if (!ref.location)
    return vcfId ? usePendingUploads.getState()[vcfId] : undefined
  return Object.values(useUploads.getState().items).find(
    (i) => i.uploadId === ref.location
  )?.key
}

/** Remove a VCF, its rows and its upload. */
export function removeVcf(vcfId: string) {
  const { update, draft } = useWizardStore.getState()
  const vcf = draft?.form.vcfs.find((v) => v.id === vcfId)
  const key = uploadKeyFor(vcf?.file, vcfId)
  if (key) useUploads.getState().remove(key)
  update((form) => ({
    ...form,
    vcfs: form.vcfs.filter((v) => v.id !== vcfId),
    accessions: form.accessions.filter((r) => r.fileId !== vcfId),
  }))
}

/** Remove a row; the last row of a file takes the file (and upload) with it. */
export function removeRow(rowId: string) {
  const form = useWizardStore.getState().draft?.form
  const row = form?.accessions.find((r) => r.id === rowId)
  if (!form || !row) return
  const vcf = form.vcfs.find((v) => v.id === row.fileId)
  const siblings = form.accessions.filter((r) => r.fileId === row.fileId)
  if (vcf && siblings.length <= 1) {
    removeVcf(vcf.id)
    return
  }
  useWizardStore.getState().update((f) => ({
    ...f,
    accessions: f.accessions.filter((r) => r.id !== rowId),
    vcfs: f.vcfs.map((v) =>
      v.id === row.fileId && v.samples && v.samples.length > 1
        ? {
            ...v,
            selected: (v.selected.length ? v.selected : v.samples).filter(
              (s) => s !== row.sample
            ),
          }
        : v
    ),
  }))
}

/** Remove whatever in the form points at an upload (uploads panel remove). */
export function forgetUpload(
  form: WizardForm,
  uploadId: string | null
): WizardForm {
  if (!uploadId) return form
  const is = (ref: FileRef | null | undefined) =>
    ref?.source === "upload" && ref.location === uploadId
  const gone = new Set(form.vcfs.filter((v) => is(v.file)).map((v) => v.id))
  const reference = { ...form.reference }
  if (is(reference.fasta)) {
    reference.fasta = null
    reference.sequences = null
    reference.chromosomes = []
  }
  if (is(reference.gff)) {
    reference.gff = null
    reference.gffSeqids = null
  }
  const options = is(form.options.index)
    ? { ...form.options, index: null, indexSamples: null }
    : form.options
  return {
    ...form,
    reference,
    options,
    vcfs: form.vcfs.filter((v) => !gone.has(v.id)),
    accessions: form.accessions.filter((r) => !gone.has(r.fileId)),
  }
}

/** "chr1 … chr12" */
export function rangeText(names: string[]): string {
  if (names.length === 0) return "none"
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]}, ${names[1]}`
  return `${names[0]} … ${names[names.length - 1]}`
}

/** "a.vcf.gz", "a.vcf.gz and b.vcf.gz", "a.vcf.gz and 3 more files" */
export function filesText(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ""
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names[0]} and ${names.length - 1} more files`
}

export const plural = (n: number, one: string, many = `${one}s`) =>
  `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`

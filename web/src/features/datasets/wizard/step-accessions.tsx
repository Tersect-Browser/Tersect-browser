import { InfoIcon } from "lucide-react"
import { useEffect, useState } from "react"

import { cn } from "@/lib/utils"

import {
  SuggestedAccessionRows,
  SuggestedAccessionsBar,
  SuggestedRenameMap,
  SuggestedSheet,
} from "../assistant/suggested-blocks"
import { accessionIssues, inlineIssues } from "../manifest"
import type { AccessionRow, ServerEntry, WizardForm } from "../types"
import { newId, useForm, useWizardStore } from "../wizard-store"
import { AccessionSheetDialog } from "./accession-sheet-dialog"
import { AccessionsAddBar } from "./accessions-add-bar"
import { useVcfInspector } from "./accessions-inspect"
import {
  addLocalFiles,
  addUrlRefs,
  addVcfRefs,
  INDEX_FILE_ID,
  isVcfName,
  plural,
} from "./accessions-shared"
import { AccessionsTable } from "./accessions-table"
import { ContigMismatch } from "./contig-mismatch"
import { PasteUrlsDialog } from "./paste-urls-dialog"
import { SelectSamplesDialog } from "./select-samples-dialog"
import { ServerFolderDialog } from "./server-folder-dialog"
import { UploadsPanel } from "./uploads-panel"

type Fix = { kind?: string; target?: string }

const HIGHLIGHT_MS = 4000

/** Row and file ids a "Fix and retry" target (accession or file name) points at. */
function resolveFix(form: WizardForm, fix: Fix | undefined) {
  const target = fix?.target
  if (!target) return { rowIds: [], fileId: undefined }
  const row =
    form.accessions.find((r) => r.name === target) ??
    form.accessions.find((r) => r.sample === target)
  const vcf = row
    ? form.vcfs.find((v) => v.id === row.fileId)
    : form.vcfs.find(
        (v) => v.file.name === target || v.file.location === target
      )
  return { rowIds: row ? [row.id] : vcf ? [vcf.id] : [], fileId: vcf?.id }
}

/** Index mode: one row per sample in the index, keeping labels and groups. */
function useIndexRows(form: WizardForm) {
  const { useIndex, indexSamples } = form.options
  const { accessions } = form
  useEffect(() => {
    const current = accessions.filter((r) => r.fileId === INDEX_FILE_ID)
    const want = useIndex ? (indexSamples ?? []) : []
    if (
      current.length === want.length &&
      current.every((r, i) => r.sample === want[i])
    )
      return
    useWizardStore.getState().update((f) => {
      const rows: AccessionRow[] = want.map(
        (sample) =>
          current.find((r) => r.sample === sample) ?? {
            id: newId("acc"),
            name: sample,
            label: sample,
            group: "",
            fileId: INDEX_FILE_ID,
            sample,
            info: {},
          }
      )
      return {
        ...f,
        accessions: [
          ...f.accessions.filter((r) => r.fileId !== INDEX_FILE_ID),
          ...rows,
        ],
      }
    })
  }, [useIndex, indexSamples, accessions])
}

/** Step 2 (6b, 2b, 2c): VCFs in, one accession row per sample. */
export function StepAccessions({
  fix,
}: {
  fix?: { kind?: string; target?: string }
}) {
  const form = useForm()
  const draftId = useWizardStore((s) => s.draft?.id)
  const addMode = useWizardStore((s) => s.draft?.mode === "add")
  const baseCount = useWizardStore((s) => s.draft?.base_accessions ?? null)
  const indexMode = form.options.useIndex
  useVcfInspector()
  useIndexRows(form)

  const [dialog, setDialog] = useState<"urls" | "server" | "sheet" | null>(null)

  // "Fix and retry": open the right control and point at the row.
  const fixKey = `${fix?.kind ?? ""}|${fix?.target ?? ""}`
  const initialFix = () => {
    const { rowIds, fileId } = resolveFix(form, fix)
    return {
      key: fixKey,
      highlight: fix?.kind === "rename-map" ? [] : rowIds,
      samplesFor: fix?.kind === "sample" ? (fileId ?? null) : null,
      contigFocus: fix?.kind === "rename-map" ? fileId : undefined,
    }
  }
  const [fixState, setFixState] = useState(initialFix)
  if (fixState.key !== fixKey) setFixState(initialFix())
  const { highlight, contigFocus } = fixState
  const samplesFor =
    form.vcfs.find((v) => v.id === fixState.samplesFor && v.samples) ?? null
  const setSamplesFor = (id: string | null) =>
    setFixState({ ...fixState, samplesFor: id })

  useEffect(() => {
    const id = contigFocus
      ? "[data-contig-focus]"
      : highlight[0] && `#acc-row-${highlight[0]}, #acc-file-${highlight[0]}`
    if (id)
      document
        .querySelector(id)
        ?.scrollIntoView({ block: "center", behavior: "smooth" })
    if (!highlight.length) return
    const timer = setTimeout(
      () => setFixState((s) => ({ ...s, highlight: [] })),
      HIGHLIGHT_MS
    )
    return () => clearTimeout(timer)
  }, [highlight, contigFocus])

  const issues = indexMode
    ? form.accessions.flatMap((r) => accessionIssues(r, form.accessions))
    : inlineIssues(form, addMode)
  const rows = form.accessions.filter((r) =>
    indexMode ? r.fileId === INDEX_FILE_ID : r.fileId !== INDEX_FILE_ID
  )
  const empty = !indexMode && form.vcfs.length === 0

  const addFiles = (files: File[]) => {
    if (draftId) addLocalFiles(files, draftId)
  }
  const addServer = (entries: ServerEntry[]) =>
    addVcfRefs(
      entries.map((e) => ({
        source: "server",
        location: e.path,
        name: e.name,
        size: e.size,
      }))
    )

  return (
    <div className="flex flex-col gap-3">
      {indexMode ? (
        <p className="flex items-start gap-2 rounded-md border bg-card px-3 py-2 text-[11px] text-muted-foreground">
          <InfoIcon className="mt-px size-3.5 shrink-0" />
          <span>
            The dataset is built from an existing Tersect index (step 3), so its
            samples come from the index and no VCFs are needed. Labels and
            groups can still be set here.
          </span>
        </p>
      ) : (
        <AccessionsAddBar
          large={empty}
          onFiles={addFiles}
          onPasteUrls={() => setDialog("urls")}
          onServerFolder={() => setDialog("server")}
          onSheet={() => setDialog("sheet")}
        />
      )}

      <UploadsPanel />

      {!indexMode && <SuggestedRenameMap />}
      {!indexMode && <ContigMismatch key={fixKey} focusFileId={contigFocus} />}
      <SuggestedSheet />

      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline gap-2">
          <h3 className="caption">Accessions</h3>
          <CountLine
            count={rows.length}
            addMode={addMode}
            indexMode={indexMode}
          />
        </div>
        {!indexMode && <SuggestedAccessionsBar />}
        <AccessionsTable
          rows={rows}
          vcfs={form.vcfs}
          issues={issues}
          existing={addMode ? (baseCount ?? 0) : null}
          indexName={indexMode ? (form.options.index?.name ?? null) : undefined}
          highlight={highlight}
          onSelectSamples={(id) => setSamplesFor(id)}
          prepend={indexMode ? undefined : <SuggestedAccessionRows />}
        />
      </div>

      <PasteUrlsDialog
        open={dialog === "urls"}
        onOpenChange={(open) => setDialog(open ? "urls" : null)}
        onAdd={(checks) =>
          addUrlRefs(checks.map((c) => ({ url: c.url, size: c.size })))
        }
      />
      <ServerFolderDialog
        open={dialog === "server"}
        onOpenChange={(open) => setDialog(open ? "server" : null)}
        multiple
        accept={isVcfName}
        title="Add VCFs from a server folder"
        onPick={addServer}
      />
      <AccessionSheetDialog
        open={dialog === "sheet"}
        onOpenChange={(open) => setDialog(open ? "sheet" : null)}
      />
      <SelectSamplesDialog
        vcf={samplesFor}
        onOpenChange={(open) => !open && setSamplesFor(null)}
      />
    </div>
  )
}

function CountLine({
  count,
  addMode,
  indexMode,
}: {
  count: number
  addMode: boolean
  indexMode: boolean
}) {
  const short = !addMode && !indexMode && count < 2
  return (
    <span
      className={cn(
        "font-mono text-[11px]",
        short && count > 0 ? "text-destructive" : "text-muted-foreground"
      )}
    >
      {short
        ? `${count} of at least 2${count === 1 ? " · at least two accessions are needed" : ""}`
        : addMode
          ? `${plural(count, "new accession")}`
          : plural(count, "accession")}
    </span>
  )
}

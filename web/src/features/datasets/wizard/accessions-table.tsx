import {
  CircleCheckIcon,
  DatabaseIcon,
  ListChecksIcon,
  LockIcon,
  RotateCwIcon,
  WandSparklesIcon,
  XIcon,
} from "lucide-react"
import type { ComponentProps, ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

import { formatBytes } from "../format"
import { fixName, type InlineIssue } from "../manifest"
import type { AccessionRow, VcfFile } from "../types"
import { useUploads, type UploadItem } from "../uploads"
import { useForm, useWizardStore } from "../wizard-store"
import {
  reinspect,
  useInspectState,
  type InspectState,
} from "./accessions-inspect"
import { GroupInput } from "./accessions-group-input"
import {
  groupNames,
  plural,
  removeRow,
  removeVcf,
  SourceIcon,
  usePendingUploads,
} from "./accessions-shared"

const COLUMNS = 7

export function updateRow(id: string, change: Partial<AccessionRow>) {
  useWizardStore.getState().update((form) => ({
    ...form,
    accessions: form.accessions.map((r) =>
      r.id === id ? { ...r, ...change } : r
    ),
  }))
}

/* ----------------------------------------------------------- status -- */

type Tone = "ok" | "muted" | "busy" | "destructive"
interface Status {
  text: string
  tone: Tone
  title?: string
}

interface FileState {
  vcf: VcfFile
  upload: UploadItem | undefined
  /** The upload exists locally but the server has not created it yet. */
  starting: boolean
  inspect: InspectState | undefined
}

const pct = (item: UploadItem) =>
  item.size ? Math.min(100, Math.floor((item.sent / item.size) * 100)) : 0

/** What the file itself is doing; null once it is read. */
function fileStatus({
  vcf,
  upload,
  starting,
  inspect,
}: FileState): Status | null {
  if (upload?.status === "failed")
    return {
      text: "Upload failed",
      tone: "destructive",
      title: upload.error ?? undefined,
    }
  if (vcf.inspectError)
    return {
      text: "Could not read",
      tone: "destructive",
      title: vcf.inspectError,
    }
  if (upload?.status === "uploading")
    return { text: `Uploading ${pct(upload)}%`, tone: "busy" }
  if (upload?.status === "paused" || upload?.status === "needs-file")
    return {
      text: `Paused at ${pct(upload)}%`,
      tone: "muted",
      title:
        upload.status === "needs-file"
          ? "Choose the file again in Uploads to resume."
          : undefined,
    }
  if (starting || (vcf.file.source === "upload" && !vcf.file.location))
    return { text: "Starting upload…", tone: "busy" }
  if (inspect?.state === "note")
    return { text: "Not read yet", tone: "muted", title: inspect.note }
  if (vcf.samples === null) return { text: "Reading header…", tone: "busy" }
  return null
}

function rowStatus(
  row: AccessionRow,
  file: FileState | undefined,
  issues: InlineIssue[]
): Status {
  const fileIssues = issues.filter((i) => i.target === file?.vcf.id)
  const own = (kind: InlineIssue["kind"]) =>
    issues.find((i) => i.target === row.id && i.kind === kind)
  const busy = file && fileStatus(file)
  if (busy?.tone === "destructive") return busy
  const contigs = fileIssues.find((i) => i.kind === "contigs")
  if (contigs)
    return {
      text: "Contig mismatch",
      tone: "destructive",
      title: contigs.message,
    }
  const genotypes = fileIssues.find((i) => i.kind === "genotypes")
  if (genotypes)
    return {
      text: "No genotypes",
      tone: "destructive",
      title: genotypes.message,
    }
  const sample = own("sample")
  if (sample)
    return {
      text: "Sample not in file",
      tone: "destructive",
      title: sample.message,
    }
  if (busy) return busy
  if (own("name")) return { text: "Name not valid", tone: "destructive" }
  if (own("duplicate")) return { text: "Duplicate name", tone: "destructive" }
  if (file?.vcf.file.source === "url")
    return {
      text: `Link checked · ${formatBytes(file.vcf.file.size)}`,
      tone: "ok",
    }
  return { text: "Ready", tone: "ok" }
}

function StatusCell({ status }: { status: Status }) {
  return (
    <span
      className={cn(
        "flex min-w-0 items-center gap-1.5 text-[11px]",
        status.tone === "destructive" && "text-destructive",
        status.tone === "muted" && "text-muted-foreground",
        status.tone === "busy" && "text-muted-foreground"
      )}
      title={status.title ?? status.text}
    >
      {status.tone === "ok" && (
        <CircleCheckIcon className="size-3 shrink-0 text-primary" />
      )}
      {status.tone === "busy" && <Spinner className="size-3 shrink-0" />}
      <span className="truncate font-mono">{status.text}</span>
    </span>
  )
}

/* ------------------------------------------------------------ table -- */

interface AccessionsTableProps {
  rows: AccessionRow[]
  vcfs: VcfFile[]
  issues: InlineIssue[]
  /** Add mode: accessions already in the dataset (locked row). */
  existing: number | null
  /** Index mode: rows are the index's samples. */
  indexName?: string | null
  highlight: string[]
  onSelectSamples: (vcfId: string) => void
  /** Rows above the table body (assistant suggestions). */
  prepend?: ReactNode
}

export function AccessionsTable({
  rows,
  vcfs,
  issues,
  existing,
  indexName,
  highlight,
  onSelectSamples,
  prepend,
}: AccessionsTableProps) {
  const uploads = useUploads((s) => s.items)
  const pending = usePendingUploads()
  const inspecting = useInspectState()
  // Same order as the summary (wizard-helpers groupsOf): first use in the form.
  const groups = groupNames(useForm().accessions)

  const fileState = (vcf: VcfFile): FileState => {
    const pendingKey = pending[vcf.id]
    const upload =
      vcf.file.source !== "upload"
        ? undefined
        : vcf.file.location
          ? Object.values(uploads).find((i) => i.uploadId === vcf.file.location)
          : pendingKey
            ? uploads[pendingKey]
            : undefined
    return {
      vcf,
      upload,
      starting: !!pendingKey && !upload?.uploadId,
      inspect: inspecting[vcf.id],
    }
  }

  const body: ReactNode[] = []
  if (existing !== null)
    body.push(<LockedRow key="existing" count={existing} />)

  if (indexName !== undefined) {
    for (const row of rows) {
      body.push(
        <AccessionRowView
          key={row.id}
          row={row}
          groups={groups}
          issues={issues.filter((i) => i.target === row.id)}
          status={{ text: "From index", tone: "ok" }}
          source={
            <span className="flex min-w-0 items-center gap-1.5">
              <DatabaseIcon className="size-3 shrink-0 text-muted-foreground" />
              <span className="truncate font-mono">
                {indexName ?? "Tersect index"}
              </span>
            </span>
          }
          highlighted={highlight.includes(row.id)}
          removable={false}
        />
      )
    }
  } else {
    for (const vcf of vcfs) {
      const state = fileState(vcf)
      const fileRows = rows.filter((r) => r.fileId === vcf.id)
      const multi = (vcf.samples?.length ?? 0) > 1
      if (multi) {
        body.push(
          <FileHeaderRow
            key={vcf.id}
            state={state}
            selected={fileRows.length}
            highlighted={highlight.includes(vcf.id)}
            onSelectSamples={() => onSelectSamples(vcf.id)}
          />
        )
      }
      for (const row of fileRows) {
        body.push(
          <AccessionRowView
            key={row.id}
            row={row}
            groups={groups}
            issues={issues.filter((i) => i.target === row.id)}
            status={rowStatus(row, state, issues)}
            indent={multi}
            source={
              multi ? null : (
                <span
                  className="flex min-w-0 items-center gap-1.5"
                  title={vcf.file.location || vcf.file.name}
                >
                  <SourceIcon source={vcf.file.source} />
                  <span className="truncate font-mono">{vcf.file.name}</span>
                </span>
              )
            }
            highlighted={
              highlight.includes(row.id) || highlight.includes(vcf.id)
            }
            removable
            onRetryRead={vcf.inspectError ? () => reinspect(vcf.id) : undefined}
          />
        )
      }
    }
  }

  const empty =
    rows.length === 0 &&
    (indexName === undefined ? vcfs.length === 0 : true) &&
    !prepend

  return (
    <div className="overflow-x-auto rounded-md border bg-card">
      <table className="w-full min-w-[800px] table-fixed border-collapse">
        <colgroup>
          <col className="w-[20%]" />
          <col className="w-[20%]" />
          <col className="w-[140px]" />
          <col className="w-[180px]" />
          <col className="w-[120px]" />
          <col className="w-[150px]" />
          <col className="w-7" />
        </colgroup>
        <thead>
          <tr className="h-6 border-b bg-muted/50 text-left">
            {["Name", "Label", "Group", "Source file", "Sample", "Status"].map(
              (h) => (
                <th key={h} scope="col" className="caption px-2 font-semibold">
                  {h}
                </th>
              )
            )}
            <th scope="col">
              <span className="sr-only">Remove</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {prepend}
          {body}
          {empty && (
            <tr>
              <td
                colSpan={COLUMNS}
                className="px-4 py-8 text-center text-muted-foreground"
              >
                {indexName !== undefined
                  ? "The samples are listed here once the index has been read."
                  : "No accessions yet. Each VCF sample becomes a row here, named after the sample. Names, labels and groups can be edited as soon as files are added."}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function LockedRow({ count }: { count: number }) {
  return (
    <tr className="h-7 border-b bg-muted/60">
      <td colSpan={COLUMNS} className="px-2">
        <span className="flex items-center gap-2 text-muted-foreground">
          <LockIcon className="size-3 shrink-0" />
          <span className="font-mono text-foreground">
            {plural(count, "existing accession")}
          </span>
          <span>
            — Unchanged. They stay available to users while the new version
            builds.
          </span>
        </span>
      </td>
    </tr>
  )
}

function FileHeaderRow({
  state,
  selected,
  highlighted,
  onSelectSamples,
}: {
  state: FileState
  selected: number
  highlighted: boolean
  onSelectSamples: () => void
}) {
  const { vcf, upload } = state
  const total = vcf.samples?.length ?? 0
  const size = formatBytes(vcf.file.size)
  const where =
    vcf.file.source === "url"
      ? `link checked, ${size}`
      : vcf.file.source === "server"
        ? `on the server, ${size}`
        : upload?.status === "verified" || !upload
          ? `uploaded, ${size}`
          : `${fileStatus(state)?.text.toLowerCase() ?? "uploading"}, ${size}`
  return (
    <tr
      id={`acc-file-${vcf.id}`}
      className={cn(
        "h-6 border-b bg-muted/40",
        highlighted && "bg-accent ring-1 ring-ring ring-inset"
      )}
    >
      <td colSpan={COLUMNS - 1} className="px-2">
        <span className="flex min-w-0 items-center gap-2">
          <SourceIcon source={vcf.file.source} />
          <span
            className="max-w-[40%] shrink-0 truncate font-mono font-medium"
            title={vcf.file.location}
          >
            {vcf.file.name}
          </span>
          <span className="min-w-0 truncate text-[11px] text-muted-foreground">
            Multi-sample file · {selected} of {plural(total, "sample")} selected
            · {where}
          </span>
          <Button
            variant="outline"
            size="xs"
            className="ml-auto h-5"
            onClick={onSelectSamples}
          >
            <ListChecksIcon /> Select samples
          </Button>
        </span>
      </td>
      <td className="text-center">
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`Remove ${vcf.file.name}`}
          onClick={() => removeVcf(vcf.id)}
        >
          <XIcon />
        </Button>
      </td>
    </tr>
  )
}

function uniqueName(name: string, taken: string[]): string {
  for (let n = 2; ; n++) {
    const candidate = `${name}_${n}`
    if (!taken.includes(candidate)) return candidate
  }
}

function AccessionRowView({
  row,
  groups,
  issues,
  status,
  source,
  indent = false,
  highlighted,
  removable,
  onRetryRead,
}: {
  row: AccessionRow
  groups: string[]
  issues: InlineIssue[]
  status: Status
  source: ReactNode
  indent?: boolean
  highlighted: boolean
  removable: boolean
  onRetryRead?: () => void
}) {
  const nameIssue = issues.find(
    (i) => i.kind === "name" || i.kind === "duplicate"
  )
  const invalid = !!nameIssue
  const subject = row.sample || row.name
  const errorId = `acc-error-${row.id}`
  const taken = () =>
    useWizardStore.getState().draft?.form.accessions.map((r) => r.name) ?? []

  const fix =
    nameIssue?.kind === "name"
      ? fixName(row.name)
      : nameIssue?.kind === "duplicate"
        ? uniqueName(row.name, taken())
        : null
  const messages = issues.filter(
    (i) => i.kind === "name" || i.kind === "duplicate" || i.kind === "sample"
  )

  return (
    <>
      <tr
        id={`acc-row-${row.id}`}
        className={cn(
          "h-6 border-b last:border-b-0 hover:bg-muted/40",
          messages.length && "border-b-0",
          highlighted && "bg-accent ring-1 ring-ring ring-inset"
        )}
      >
        <td className={cn("px-1", indent && "pl-5")}>
          <CellInput
            aria-label={`Name of ${subject}`}
            aria-invalid={invalid}
            aria-describedby={messages.length ? errorId : undefined}
            className="font-mono"
            value={row.name}
            onChange={(name) => updateRow(row.id, { name })}
          />
        </td>
        <td className="px-1">
          <CellInput
            aria-label={`Label of ${subject}`}
            value={row.label}
            placeholder={row.name}
            onChange={(label) => updateRow(row.id, { label })}
          />
        </td>
        <td className="px-1">
          <GroupInput
            label={`Group of ${subject}`}
            value={row.group}
            groups={groups}
            onChange={(group) => updateRow(row.id, { group })}
          />
        </td>
        <td className="px-2">{source}</td>
        <td className="truncate px-2 font-mono" title={row.sample}>
          {row.sample || <span className="text-muted-foreground">—</span>}
        </td>
        <td className="px-2">
          <span className="flex min-w-0 items-center gap-1">
            <StatusCell status={status} />
            {onRetryRead && (
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Read the header again"
                onClick={onRetryRead}
              >
                <RotateCwIcon />
              </Button>
            )}
          </span>
        </td>
        <td className="text-center">
          {removable && (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`Remove ${subject}`}
              onClick={() => removeRow(row.id)}
            >
              <XIcon />
            </Button>
          )}
        </td>
      </tr>
      {messages.length > 0 && (
        <tr className={cn("border-b", highlighted && "bg-accent")}>
          <td colSpan={COLUMNS} className={cn("px-2 pb-1", indent && "pl-6")}>
            <span
              id={errorId}
              className="flex flex-wrap items-center gap-x-2 text-[11px] text-destructive"
            >
              {messages.map((m) => (
                <span key={m.kind}>{m.message}</span>
              ))}
              {fix && (
                <Button
                  variant="ghost"
                  size="xs"
                  className="h-5 text-foreground"
                  onClick={() => updateRow(row.id, { name: fix })}
                >
                  <WandSparklesIcon /> Use{" "}
                  <span className="font-mono">{fix}</span>
                </Button>
              )}
            </span>
          </td>
        </tr>
      )}
    </>
  )
}

function CellInput({
  value,
  onChange,
  className,
  ...props
}: Omit<ComponentProps<"input">, "onChange" | "value"> & {
  value: string
  onChange: (value: string) => void
}) {
  return (
    <input
      {...props}
      spellCheck={false}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={cn(
        "h-5 w-full min-w-0 rounded-sm border border-transparent bg-transparent px-1.5 outline-none placeholder:text-muted-foreground hover:border-input focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30",
        "aria-invalid:border-destructive aria-invalid:bg-destructive/[0.06] aria-invalid:focus-visible:ring-destructive/20",
        className
      )}
    />
  )
}

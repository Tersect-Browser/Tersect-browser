import { FileSpreadsheetIcon } from "lucide-react"
import { useMemo, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

import type { AccessionRow } from "../types"
import { useForm, useWizardStore } from "../wizard-store"
import { DOCKED_DIALOG, plural } from "./accessions-shared"

/* ---------------------------------------------------------- parsing -- */

type Delimiter = "\t" | "," | ";"
const DELIMITER_NAMES: Record<Delimiter, string> = {
  "\t": "tab-separated",
  ",": "comma-separated",
  ";": "semicolon-separated",
}

function detectDelimiter(text: string): Delimiter {
  const line = text.split(/\r?\n/).find((l) => l.trim()) ?? ""
  const count = (d: string) => line.split(d).length - 1
  if (count("\t") > 0) return "\t"
  return count(";") > count(",") ? ";" : ","
}

/** CSV/TSV with quoted fields ("a, b", "say ""hi"""), CRLF or LF. */
export function parseDelimited(text: string, delimiter: Delimiter): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (c === '"') quoted = false
      else field += c
    } else if (c === '"' && field === "") quoted = true
    else if (c === delimiter) {
      row.push(field)
      field = ""
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++
      row.push(field)
      rows.push(row)
      row = []
      field = ""
    } else field += c
  }
  if (field !== "" || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows
    .map((r) => r.map((cell) => cell.trim()))
    .filter((r) => r.some((cell) => cell !== ""))
}

type Role = "name" | "label" | "group" | "info" | "ignore"
const ROLE_LABELS: Record<Role, string> = {
  name: "Name (match key)",
  label: "Label",
  group: "Group",
  info: "Info column",
  ignore: "Ignore",
}
const SINGLE_ROLES: Role[] = ["name", "label", "group"]

const NAME_HEADER =
  /^(name|accession|accession[ _]?(name|id)|acc|sample|sample[ _]?(name|id)|id)$/i
const LABEL_HEADER = /label|display|title/i
const GROUP_HEADER = /group|population|species|category|clade|class|type/i
const HEADER_WORD =
  /name|accession|sample|label|group|species|population|id\b|origin|country/i

interface Sheet {
  delimiter: Delimiter
  header: boolean
  columns: string[]
  rows: string[][]
}

function readSheet(text: string, accessions: AccessionRow[]): Sheet | null {
  if (!text.trim()) return null
  const delimiter = detectDelimiter(text)
  const all = parseDelimited(text, delimiter)
  if (!all.length) return null
  const width = Math.max(...all.map((r) => r.length))
  const keys = matchKeys(accessions)
  const first = all[0]
  const header =
    all.length > 1 &&
    !first.some((cell) => keys.has(cell)) &&
    (first.some((cell) => HEADER_WORD.test(cell)) ||
      all.slice(1).some((r) => r.some((cell) => keys.has(cell))))
  const columns = Array.from({ length: width }, (_, i) =>
    header && first[i] ? first[i] : `Column ${i + 1}`
  )
  const rows = (header ? all.slice(1) : all).map((r) =>
    Array.from({ length: width }, (_, i) => r[i] ?? "")
  )
  return { delimiter, header, columns, rows }
}

function guessRoles(sheet: Sheet, accessions: AccessionRow[]): Role[] {
  const roles: Role[] = sheet.columns.map(() => "info")
  const keys = matchKeys(accessions)
  const take = (role: Role, test: (i: number) => boolean) => {
    const i = roles.findIndex((r, index) => r === "info" && test(index))
    if (i >= 0) roles[i] = role
  }
  if (sheet.header) {
    take("name", (i) => NAME_HEADER.test(sheet.columns[i]))
    take("label", (i) => LABEL_HEADER.test(sheet.columns[i]))
    take("group", (i) => GROUP_HEADER.test(sheet.columns[i]))
  }
  if (!roles.includes("name")) {
    // The column with the most cells naming an accession.
    const hits = sheet.columns.map(
      (_, i) => sheet.rows.filter((r) => keys.has(r[i])).length
    )
    const best = hits.indexOf(Math.max(...hits))
    roles[best >= 0 ? best : 0] = "name"
  }
  return roles
}

/** Accession name, then VCF sample name, → row. */
function matchKeys(accessions: AccessionRow[]): Map<string, AccessionRow> {
  const keys = new Map<string, AccessionRow>()
  for (const row of accessions)
    if (row.sample && !keys.has(row.sample)) keys.set(row.sample, row)
  for (const row of accessions) keys.set(row.name, row)
  return keys
}

/* ----------------------------------------------------------- dialog -- */

/** 7c: labels, groups and info columns from a CSV/TSV, matched by name. */
export function AccessionSheetDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("sm:max-w-[660px]", DOCKED_DIALOG)}>
        <DialogHeader>
          <DialogTitle>Accession sheet</DialogTitle>
          <DialogDescription>
            A CSV or TSV with one row per accession. Rows are matched to
            accessions by name (or VCF sample name); accessions without a row
            keep their values.
          </DialogDescription>
        </DialogHeader>
        {open && <SheetForm onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function SheetForm({ onClose }: { onClose: () => void }) {
  const { accessions } = useForm()
  const [tab, setTab] = useState<"paste" | "upload">("paste")
  const [text, setText] = useState("")
  const [fileName, setFileName] = useState<string | null>(null)
  const [roleEdits, setRoleEdits] = useState<{
    text: string
    roles: Role[]
  } | null>(null)

  const sheet = useMemo(() => readSheet(text, accessions), [text, accessions])
  const guessed = useMemo(
    () => (sheet ? guessRoles(sheet, accessions) : []),
    [sheet, accessions]
  )
  // Mapping edits apply to the text they were made for.
  const roles = roleEdits?.text === text ? roleEdits.roles : guessed

  const setRole = (column: number, role: Role) => {
    const next = roles.map((r, i) =>
      i === column
        ? role
        : SINGLE_ROLES.includes(role) && r === role
          ? "ignore"
          : r
    )
    setRoleEdits({ text, roles: next })
  }

  const nameColumn = roles.indexOf("name")
  const keys = matchKeys(accessions)
  const matches = sheet?.rows.map((r) =>
    nameColumn >= 0 ? keys.get(r[nameColumn]) : undefined
  )
  const matched = new Set((matches ?? []).filter(Boolean).map((r) => r!.id))
  const unused = (matches ?? []).filter((m) => !m).length

  const apply = () => {
    if (!sheet || !matches) return
    const changes = new Map<string, Partial<AccessionRow>>()
    sheet.rows.forEach((cells, r) => {
      const row = matches[r]
      if (!row) return
      const change: Partial<AccessionRow> = { info: {} }
      roles.forEach((role, c) => {
        const value = cells[c]
        if (!value) return
        if (role === "label") change.label = value
        else if (role === "group") change.group = value
        else if (role === "info") change.info![sheet.columns[c]] = value
      })
      changes.set(row.id, change)
    })
    useWizardStore.getState().update((form) => ({
      ...form,
      accessions: form.accessions.map((row) => {
        const change = changes.get(row.id)
        return change
          ? { ...row, ...change, info: { ...row.info, ...change.info } }
          : row
      }),
    }))
    onClose()
  }

  return (
    <>
      <div
        role="tablist"
        aria-label="Sheet source"
        className="flex w-fit rounded-md bg-muted p-0.5"
      >
        {(["paste", "upload"] as const).map((value) => (
          <button
            key={value}
            role="tab"
            type="button"
            aria-selected={tab === value}
            className={cn(
              "h-(--c20) rounded-[3px] px-[calc(10px+var(--pad-x))] text-t11 whitespace-nowrap focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none",
              tab === value
                ? "bg-card font-medium shadow-sm"
                : "text-muted-foreground"
            )}
            onClick={() => setTab(value)}
          >
            {value === "paste" ? "Paste" : "Upload"}
          </button>
        ))}
      </div>

      {tab === "paste" ? (
        <Textarea
          aria-label="Sheet contents"
          spellCheck={false}
          className="max-h-32 min-h-20 font-mono text-t11 md:text-t11"
          placeholder={
            "name\tlabel\tgroup\nLA1777\tS. habrochaites LA1777\tWild"
          }
          value={text}
          onChange={(event) => {
            setText(event.target.value)
            setFileName(null)
          }}
        />
      ) : (
        <SheetUpload
          fileName={fileName}
          onRead={(name, contents) => {
            setFileName(name)
            setText(contents)
          }}
        />
      )}

      {sheet && (
        <>
          <p className="text-t11 text-muted-foreground">
            Detected: {DELIMITER_NAMES[sheet.delimiter]},{" "}
            {sheet.header ? "header row" : "no header row"},{" "}
            {plural(sheet.rows.length, "row")}.
          </p>
          <SheetPreview
            sheet={sheet}
            roles={roles}
            onRole={setRole}
            matches={matches ?? []}
          />
        </>
      )}

      <DialogFooter className="items-center justify-between">
        <span className="font-mono text-t11 text-muted-foreground">
          {sheet
            ? `${matched.size} of ${plural(accessions.length, "accession")} matched · ${plural(unused, "sheet row")} unused`
            : `${plural(accessions.length, "accession")} to match`}
        </span>
        <div className="flex gap-1.5">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" disabled={!matched.size} onClick={apply}>
            Apply to {plural(matched.size, "accession")}
          </Button>
        </div>
      </DialogFooter>
    </>
  )
}

function SheetUpload({
  fileName,
  onRead,
}: {
  fileName: string | null
  onRead: (name: string, text: string) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const read = (file: File | undefined) => {
    if (file) void file.text().then((text) => onRead(file.name, text))
  }
  return (
    <div
      className={cn(
        "flex h-20 flex-col items-center justify-center gap-1.5 rounded-md border border-dashed border-input text-muted-foreground",
        over && "border-ring bg-accent/60"
      )}
      onDragOver={(event) => {
        event.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault()
        setOver(false)
        read(event.dataTransfer.files[0])
      }}
    >
      <div className="flex items-center gap-2">
        <FileSpreadsheetIcon className="size-4" />
        {fileName ? (
          <span className="font-mono text-foreground">{fileName}</span>
        ) : (
          <span>Drop a .csv or .tsv file here</span>
        )}
        <Button
          variant="outline"
          size="xs"
          onClick={() => input.current?.click()}
        >
          {fileName ? "Choose another" : "Browse"}
        </Button>
      </div>
      <input
        ref={input}
        type="file"
        accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values"
        className="hidden"
        onChange={(event) => {
          read(event.target.files?.[0])
          event.target.value = ""
        }}
      />
    </div>
  )
}

const PREVIEW_ROWS = 50

function SheetPreview({
  sheet,
  roles,
  onRole,
  matches,
}: {
  sheet: Sheet
  roles: Role[]
  onRole: (column: number, role: Role) => void
  matches: (AccessionRow | undefined)[]
}) {
  return (
    <div className="max-h-[260px] min-w-0 overflow-auto rounded-md border max-sm:max-h-[36dvh]">
      <table className="w-full min-w-max border-collapse text-t11">
        <thead className="sticky top-0 z-10 bg-popover">
          <tr className="border-b">
            {sheet.columns.map((column, i) => (
              <th key={i} className="px-1.5 py-1 text-left font-normal">
                <Select
                  value={roles[i]}
                  onValueChange={(role) => onRole(i, role as Role)}
                >
                  <SelectTrigger
                    size="sm"
                    aria-label={`Use of ${column}`}
                    className={cn(
                      "h-(--c20)! min-w-28 text-t11",
                      roles[i] === "ignore" && "text-muted-foreground",
                      roles[i] === "name" && "border-ring"
                    )}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {(Object.keys(ROLE_LABELS) as Role[]).map((role) => (
                      <SelectItem key={role} value={role}>
                        {ROLE_LABELS[role]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </th>
            ))}
            <th className="caption px-2 text-left align-middle">Match</th>
          </tr>
          <tr className="border-b">
            {sheet.columns.map((column, i) => (
              <th
                key={i}
                className={cn(
                  "h-5 px-2 text-left font-medium",
                  roles[i] === "ignore" && "text-muted-foreground"
                )}
              >
                {column}
              </th>
            ))}
            <th />
          </tr>
        </thead>
        <tbody>
          {sheet.rows.slice(0, PREVIEW_ROWS).map((cells, r) => (
            <tr key={r} className="h-5 border-b last:border-b-0">
              {cells.map((cell, c) => (
                <td
                  key={c}
                  className={cn(
                    "max-w-48 truncate px-2",
                    roles[c] === "name" && "font-mono",
                    roles[c] === "ignore" && "text-muted-foreground"
                  )}
                  title={cell}
                >
                  {cell}
                </td>
              ))}
              <td className="px-2 whitespace-nowrap">
                {matches[r] ? (
                  <span className="text-primary">Matched</span>
                ) : (
                  <span className="text-destructive">
                    No accession with this name
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {sheet.rows.length > PREVIEW_ROWS && (
        <p className="border-t px-2 py-1 text-t11 text-muted-foreground">
          {plural(sheet.rows.length - PREVIEW_ROWS, "more row")} not shown
        </p>
      )}
    </div>
  )
}

import { ArrowRightIcon, CircleAlertIcon, CircleCheckIcon } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

import { hasContigMismatch, suggestRenameMap } from "../manifest"
import type { VcfFile } from "../types"
import { useForm, useWizardStore } from "../wizard-store"
import {
  filesText,
  LIST_CHECKBOX,
  plural,
  rangeText,
} from "./accessions-shared"

const KEEP = "__keep"
/** Contigs listed before "Show all"; the rest are usually scaffolds. */
const SHOWN_CONTIGS = 30

interface ContigGroup {
  key: string
  contigs: string[]
  files: VcfFile[]
  /** Files of the group that hit none of the chosen chromosomes. */
  mismatched: VcfFile[]
  mismatch: boolean
  /** Some file of the group has a rename map. */
  renamed: boolean
}

const groupKey = (contigs: string[]) => [...contigs].sort().join("\n")

function contigGroups(vcfs: VcfFile[], chromosomes: string[]): ContigGroup[] {
  const groups = new Map<string, ContigGroup>()
  for (const vcf of vcfs) {
    if (!vcf.contigs?.length) continue
    const key = groupKey(vcf.contigs)
    const group = groups.get(key) ?? {
      key,
      contigs: vcf.contigs,
      files: [],
      mismatched: [],
      mismatch: false,
      renamed: false,
    }
    group.files.push(vcf)
    if (hasContigMismatch(vcf, chromosomes)) {
      group.mismatched.push(vcf)
      group.mismatch = true
    }
    group.renamed ||=
      vcf.renameContigs !== null && Object.keys(vcf.renameContigs).length > 0
    groups.set(key, group)
  }
  return [...groups.values()]
}

/**
 * 2c: VCFs whose contig names miss the reference get a rename map
 * (VCF contig → reference sequence), applied per file as renameContigs.
 */
export function ContigMismatch({ focusFileId }: { focusFileId?: string }) {
  const form = useForm()
  const { chromosomes, sequences } = form.reference
  const reference = chromosomes.length
    ? chromosomes
    : (sequences ?? []).map((s) => s.name)
  const groups = contigGroups(form.vcfs, chromosomes)

  const [editing, setEditing] = useState<Set<string>>(() => {
    const vcf = form.vcfs.find((v) => v.id === focusFileId)
    return new Set(vcf?.contigs?.length ? [groupKey(vcf.contigs)] : [])
  })
  const setEdit = (key: string, on: boolean) => {
    const next = new Set(editing)
    if (on) next.add(key)
    else next.delete(key)
    setEditing(next)
  }

  const shown = groups.filter(
    (g) => g.mismatch || g.renamed || editing.has(g.key)
  )
  if (!shown.length || !reference.length) return null

  return (
    <div className="flex flex-col gap-2">
      {shown.map((group) =>
        group.mismatch || editing.has(group.key) ? (
          <RenameEditor
            key={group.key}
            id={`contigs-${group.files[0].id}`}
            group={group}
            reference={reference}
            focused={group.files.some((f) => f.id === focusFileId)}
            onDone={() => setEdit(group.key, false)}
          />
        ) : (
          <RenamedLine
            key={group.key}
            group={group}
            onEdit={() => setEdit(group.key, true)}
          />
        )
      )}
    </div>
  )
}

function RenamedLine({
  group,
  onEdit,
}: {
  group: ContigGroup
  onEdit: () => void
}) {
  const renamed = group.files.filter(
    (f) => f.renameContigs && Object.keys(f.renameContigs).length
  )
  const map = renamed[0]?.renameContigs ?? {}
  const pairs = Object.entries(map)
  return (
    <div className="flex min-h-7 items-center gap-2 rounded-md border px-2.5 py-1 text-t11 max-sm:pr-1">
      <CircleCheckIcon className="size-3.5 shrink-0 text-primary" />
      <span className="min-w-0 flex-1 truncate max-sm:whitespace-normal">
        Contigs renamed for{" "}
        <span className="font-mono">
          {filesText(renamed.map((f) => f.file.name))}
        </span>
        {pairs.length > 0 && (
          <>
            :{" "}
            <span className="font-mono">
              {pairs[0][0]} → {pairs[0][1]}
            </span>
            {pairs.length > 1 &&
              ` and ${plural(pairs.length - 1, "more contig")}`}
          </>
        )}
        .
      </span>
      <Button variant="ghost" size="xs" onClick={onEdit}>
        Edit
      </Button>
    </div>
  )
}

function RenameEditor({
  id,
  group,
  reference,
  focused,
  onDone,
}: {
  id: string
  group: ContigGroup
  reference: string[]
  focused: boolean
  onDone: () => void
}) {
  const suggestion = suggestRenameMap(group.contigs, reference)
  const existing = group.files.find((f) => f.renameContigs)?.renameContigs
  const [map, setMap] = useState<Record<string, string>>(
    () => existing ?? suggestion
  )
  const [allFiles, setAllFiles] = useState(true)
  const [showAll, setShowAll] = useState(false)

  const named = group.mismatch ? group.mismatched : group.files
  // Contigs with a mapping first; unplaced ones after "Show all".
  const ordered = [
    ...group.contigs.filter((c) => map[c] || suggestion[c]),
    ...group.contigs.filter((c) => !map[c] && !suggestion[c]),
  ]
  const contigs = showAll ? ordered : ordered.slice(0, SHOWN_CONTIGS)
  const refRange = rangeText(reference)
  const vcfRange = rangeText(group.contigs)
  const noSuggestion = Object.keys(suggestion).length === 0
  const mapped = Object.keys(map).length

  const apply = () => {
    const targets = new Set(
      allFiles ? group.files.map((f) => f.id) : [named[0].id]
    )
    useWizardStore.getState().update((form) => ({
      ...form,
      vcfs: form.vcfs.map((v) =>
        targets.has(v.id)
          ? { ...v, renameContigs: mapped ? { ...map } : null }
          : v
      ),
    }))
    onDone()
  }

  return (
    <section
      id={id}
      aria-label="Contig names do not match the reference"
      data-contig-focus={focused || undefined}
      className={cn(
        "flex scroll-mt-4 flex-col gap-2 rounded-md border border-destructive/40 bg-destructive/[0.07] p-2.5",
        focused && "ring-2 ring-destructive/30"
      )}
    >
      <div className="flex gap-2">
        <CircleAlertIcon className="mt-px size-3.5 shrink-0 text-destructive" />
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="font-semibold text-destructive">
            {group.mismatch
              ? "Contig names do not match the reference"
              : "Rename map"}
          </p>
          <p className="text-t11 text-pretty">
            <span className="font-mono">
              {filesText(named.map((f) => f.file.name))}
            </span>{" "}
            {named.length === 1 ? "uses" : "use"}{" "}
            <span className="font-mono">{vcfRange}</span>; the reference uses{" "}
            <span className="font-mono">{refRange}</span>.{" "}
            {noSuggestion
              ? "No contig could be matched by chromosome number. Pick the reference sequence for each contig."
              : "Map each VCF contig to a reference sequence; the suggestion matches them by chromosome number."}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(260px,100%),1fr))] gap-x-4 gap-y-1 rounded-md bg-card p-2 max-sm:gap-y-2.5">
        {contigs.map((contig) => (
          <div
            key={contig}
            className="flex min-h-6 min-w-0 items-center gap-1.5 max-sm:flex-col max-sm:items-stretch max-sm:gap-1"
          >
            <span
              className="w-24 shrink-0 truncate font-mono text-t11 max-sm:w-auto"
              title={contig}
            >
              {contig}
            </span>
            <ArrowRightIcon className="size-3 shrink-0 text-muted-foreground max-sm:hidden" />
            <Select
              value={map[contig] ?? KEEP}
              onValueChange={(value) => {
                const next = { ...map }
                if (value === KEEP) delete next[contig]
                else next[contig] = value
                setMap(next)
              }}
            >
              <SelectTrigger
                size="sm"
                aria-label={`Reference sequence for ${contig}`}
                className="h-(--c20)! min-w-0 flex-1 font-mono text-t11 max-sm:w-full max-sm:flex-none"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" className="max-h-64">
                <SelectItem
                  value={KEEP}
                  className="font-sans text-muted-foreground"
                >
                  Leave as is
                </SelectItem>
                {reference.map((name) => (
                  <SelectItem key={name} value={name} className="font-mono">
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
        {ordered.length > SHOWN_CONTIGS && (
          <Button
            variant="link"
            size="xs"
            className="col-span-full w-fit px-0"
            onClick={() => setShowAll(!showAll)}
          >
            {showAll
              ? "Show fewer"
              : `Show all ${plural(ordered.length, "contig")}`}
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {group.files.length > 1 && (
          <label className="flex min-w-0 items-center gap-1.5 text-t11">
            <Checkbox
              className={LIST_CHECKBOX}
              checked={allFiles}
              onCheckedChange={(on) => setAllFiles(on === true)}
            />
            Apply to all {group.files.length} files with these contig names
          </label>
        )}
        <span className="flex-1 max-sm:hidden" />
        {!group.mismatch && (
          <Button variant="ghost" size="sm" onClick={onDone}>
            Cancel
          </Button>
        )}
        <Button size="sm" disabled={!mapped && group.mismatch} onClick={apply}>
          Apply rename map
        </Button>
      </div>
    </section>
  )
}

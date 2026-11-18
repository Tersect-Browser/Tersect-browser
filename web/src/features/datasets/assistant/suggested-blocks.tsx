/**
 * The SUGGESTED blocks and rows each wizard step shows for applied
 * assistant proposals. Steps mount these; each renders nothing without a
 * suggestion of its kind.
 */
import { ArrowRightIcon, CheckIcon, LinkIcon, XIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { formatBytes, formatCount } from "../format"
import { useForm, useWizardStore } from "../wizard-store"
import {
  SuggestedBadge,
  SuggestedBlock,
  SuggestedValues,
  suggestedSurface,
  useFreshScroll,
} from "./suggested"
import {
  acceptAccessions,
  acceptOptions,
  acceptReference,
  acceptRenameMap,
  acceptSheet,
  rejectSuggestion,
  renameTargets,
  sheetMatches,
  useSuggestionsOf,
} from "./suggestions"
import type { ProposedAccession } from "./types"

const useDraftId = () => useWizardStore((s) => s.draft?.id)

const plural = (n: number, one: string, many = `${one}s`) =>
  `${formatCount(n)} ${n === 1 ? one : many}`

/** Accession rows previewed at the top of the step 2 table. */
const PREVIEW_ROWS = 6

/* -------------------------------------------------------- step 1 -- */

/** Under the FASTA and GFF fields. */
export function SuggestedReference() {
  const draftId = useDraftId()
  const form = useForm()
  const [suggestion] = useSuggestionsOf(draftId, "reference").slice(-1)
  if (!draftId || !suggestion) return null
  const { proposal } = suggestion
  const { fasta, gff, reference_id, name, description } = proposal.payload
  const rows = [
    fasta && {
      label: "Reference FASTA",
      value: <FileValue name={fasta.location} size={fasta.size} />,
    },
    gff && {
      label: "Gene models",
      value: <FileValue name={gff.location} size={gff.size} />,
    },
    reference_id && { label: "Reference id", value: reference_id, mono: true },
    name &&
      !form.name.trim() && { label: "Dataset name", value: name, mono: true },
    description &&
      !form.description.trim() && { label: "Description", value: description },
  ].filter((r) => !!r)
  return (
    <SuggestedBlock
      title={proposal.title}
      source={proposal.source}
      appliedAt={suggestion.appliedAt}
      onAccept={() => acceptReference(draftId, proposal)}
      onDismiss={() => rejectSuggestion(draftId, proposal.id)}
    >
      <SuggestedValues rows={rows} />
    </SuggestedBlock>
  )
}

function FileValue({ name, size }: { name: string; size?: number | null }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5" title={name}>
      <LinkIcon className="size-3 shrink-0 text-muted-foreground" />
      <span className="min-w-0 truncate font-mono">{name}</span>
      {size != null && (
        <span className="shrink-0 font-mono text-muted-foreground">
          {formatBytes(size)}
        </span>
      )}
    </span>
  )
}

/* -------------------------------------------------------- step 2 -- */

/** Bar above the accessions table. */
export function SuggestedAccessionsBar() {
  const draftId = useDraftId()
  const [suggestion] = useSuggestionsOf(draftId, "accessions").slice(-1)
  const ref = useFreshScroll<HTMLDivElement>(suggestion?.appliedAt ?? 0)
  if (!draftId || !suggestion) return null
  const { proposal } = suggestion
  const { rows, missing } = proposal.payload
  const shown = Math.min(rows.length, PREVIEW_ROWS)
  const accept = () => {
    const added = acceptAccessions(draftId, proposal)
    const skipped = rows.length - added
    toast.success(`${plural(added, "accession")} added`, {
      description: skipped
        ? `${plural(skipped, "name")} already in the table ${skipped === 1 ? "was" : "were"} left out. Their VCF headers are read now.`
        : "Their VCF headers are read now.",
    })
  }
  return (
    <div
      ref={ref}
      role="region"
      aria-label="Accessions suggested by the assistant"
      className={cn(
        suggestedSurface,
        "flex scroll-mt-4 flex-wrap items-center gap-x-3 gap-y-1.5 px-2.5 py-1.5"
      )}
    >
      <SuggestedBadge />
      <div className="flex min-w-[240px] flex-1 flex-col gap-0.5">
        <p className="text-[11px]">
          <span className="font-semibold">
            {plural(rows.length, "accession")} from the assistant
          </span>
          {rows.length > shown && `, showing the first ${shown}`}.{" "}
          <span className="text-muted-foreground">
            Source: {proposal.source}. They are not part of the dataset until
            accepted.
            {missing.length > 0 &&
              ` ${plural(missing.length, "accession")} without a VCF location ${missing.length === 1 ? "is" : "are"} left out.`}
          </span>
        </p>
      </div>
      <div className="ml-auto flex shrink-0 gap-1.5">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => rejectSuggestion(draftId, proposal.id)}
        >
          <XIcon /> Dismiss all
        </Button>
        <Button size="sm" disabled={!rows.length} onClick={accept}>
          <CheckIcon /> Accept all {formatCount(rows.length)}
        </Button>
      </div>
    </div>
  )
}

/** Tinted preview rows for the top of the accessions table (7 columns). */
export function SuggestedAccessionRows() {
  const draftId = useDraftId()
  const [suggestion] = useSuggestionsOf(draftId, "accessions").slice(-1)
  if (!suggestion) return null
  const { rows } = suggestion.proposal.payload
  const shown = rows.slice(0, PREVIEW_ROWS)
  return (
    <>
      {shown.map((row, i) => (
        <SuggestedRow key={`${row.name}-${i}`} row={row} />
      ))}
      {rows.length > shown.length && (
        <tr className="h-6 border-b bg-accent/60">
          <td colSpan={7} className="px-2 text-[11px] text-muted-foreground">
            and {plural(rows.length - shown.length, "more suggested accession")}
          </td>
        </tr>
      )}
    </>
  )
}

function SuggestedRow({ row }: { row: ProposedAccession }) {
  return (
    <tr className="h-6 border-b bg-accent/60 text-[11px]">
      <td className="truncate px-2 font-mono text-xs" title={row.name}>
        {row.name}
      </td>
      <td className="truncate px-2 text-xs" title={row.label}>
        {row.label || row.name}
      </td>
      <td className="truncate px-2 text-xs" title={row.group ?? undefined}>
        {row.group || <span className="text-muted-foreground">—</span>}
      </td>
      <td className="px-2">
        <span
          className="flex min-w-0 items-center gap-1.5"
          title={row.vcf.location}
        >
          <LinkIcon className="size-3 shrink-0 text-muted-foreground" />
          <span className="truncate font-mono">{row.vcf.name}</span>
        </span>
      </td>
      <td className="truncate px-2 font-mono" title={row.sample ?? undefined}>
        {row.sample || <span className="text-muted-foreground">—</span>}
      </td>
      {/* The badge sits in Status (as in the design), so the name stays readable. */}
      <td className="px-2">
        <span className="flex min-w-0 items-center gap-1.5">
          <SuggestedBadge />
          <span className="truncate font-mono text-muted-foreground">
            {row.vcf.size != null
              ? `Link checked · ${formatBytes(row.vcf.size)}`
              : "Link checked"}
          </span>
        </span>
      </td>
      <td />
    </tr>
  )
}

/** Next to the contig mismatch editor. */
export function SuggestedRenameMap() {
  const draftId = useDraftId()
  const form = useForm()
  const suggestions = useSuggestionsOf(draftId, "rename-map")
  if (!draftId || !suggestions.length) return null
  return (
    <>
      {suggestions.map(({ proposal, appliedAt }) => {
        const targets = renameTargets(form, proposal)
        const pairs = Object.entries(proposal.payload.map)
        return (
          <SuggestedBlock
            key={proposal.id}
            title={proposal.title}
            source={proposal.source}
            appliedAt={appliedAt}
            acceptLabel="Accept rename map"
            acceptDisabled={!targets.length || !pairs.length}
            onAccept={() => acceptRenameMap(draftId, proposal)}
            onDismiss={() => rejectSuggestion(draftId, proposal.id)}
          >
            <p className="text-[11px]">
              {targets.length ? (
                <>
                  For{" "}
                  <span className="font-mono">
                    {targets.length <= 2
                      ? targets.map((t) => t.file.name).join(" and ")
                      : `${targets[0].file.name} and ${plural(targets.length - 1, "more file")}`}
                  </span>
                  : {plural(pairs.length, "contig")} renamed to reference
                  sequences.
                </>
              ) : (
                <span className="text-destructive">
                  None of the files it names (
                  <span className="font-mono">
                    {proposal.payload.files.join(", ")}
                  </span>
                  ) are in the table.
                </span>
              )}
            </p>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-4 gap-y-0.5 rounded-sm bg-card/70 px-2 py-1.5">
              {pairs.slice(0, 12).map(([from, to]) => (
                <span
                  key={from}
                  className="flex min-w-0 items-center gap-1.5 font-mono text-[11px]"
                >
                  <span className="truncate">{from}</span>
                  <ArrowRightIcon className="size-3 shrink-0 text-muted-foreground" />
                  <span className="truncate">{to}</span>
                </span>
              ))}
              {pairs.length > 12 && (
                <span className="text-[11px] text-muted-foreground">
                  and {plural(pairs.length - 12, "more")}
                </span>
              )}
            </div>
          </SuggestedBlock>
        )
      })}
    </>
  )
}

/** Labels, groups and info for rows already in the table. */
export function SuggestedSheet() {
  const draftId = useDraftId()
  const form = useForm()
  const [suggestion] = useSuggestionsOf(draftId, "sheet").slice(-1)
  if (!draftId || !suggestion) return null
  const { proposal } = suggestion
  const matches = sheetMatches(form, proposal)
  const matched = matches.filter((m) => m.row).length
  const columns = [
    ...new Set(
      proposal.payload.rows.flatMap((r) => [
        ...(r.label ? ["label"] : []),
        ...(r.group ? ["group"] : []),
        ...Object.keys(r.info),
      ])
    ),
  ]
  return (
    <SuggestedBlock
      title={proposal.title}
      source={proposal.source}
      appliedAt={suggestion.appliedAt}
      acceptLabel={`Accept for ${plural(matched, "accession")}`}
      acceptDisabled={!matched}
      onAccept={() => {
        const n = acceptSheet(draftId, proposal)
        toast.success(`Labels and groups set for ${plural(n, "accession")}`)
      }}
      onDismiss={() => rejectSuggestion(draftId, proposal.id)}
    >
      <p className="text-[11px]">
        <span className="font-mono">
          {formatCount(matched)} of {plural(matches.length, "sheet row")}
        </span>{" "}
        match accessions in the table by name
        {matches.length - matched > 0 &&
          `; ${plural(matches.length - matched, "row")} would be left out`}
        .{" "}
        {columns.length > 0 && (
          <>
            Sets <span className="font-mono">{columns.join(", ")}</span>.
          </>
        )}
      </p>
    </SuggestedBlock>
  )
}

/* -------------------------------------------------------- step 3 -- */

const EFFECTS = {
  build: "Build from GFF",
  prebuilt: "Prebuilt snpEff database",
  none: "None",
}
const TYPES = { snps: "SNPs", indels: "Indels", both: "SNPs and indels" }

export function SuggestedOptions() {
  const draftId = useDraftId()
  const form = useForm()
  const [suggestion] = useSuggestionsOf(draftId, "options").slice(-1)
  if (!draftId || !suggestion) return null
  const { proposal } = suggestion
  const { effects, snpeff_db, types, homozygous } = proposal.payload
  const { options } = form
  const changes = [
    effects !== null && {
      label: "Variant effects",
      from: EFFECTS[options.effects],
      to: EFFECTS[effects],
    },
    snpeff_db !== null && {
      label: "snpEff database",
      from: options.snpeffDb || "—",
      to: snpeff_db,
    },
    types !== null && {
      label: "Variant types",
      from: TYPES[options.types],
      to: TYPES[types],
    },
    homozygous !== null && {
      label: "Homozygous only",
      from: options.homozygous ? "On" : "Off",
      to: homozygous ? "On" : "Off",
    },
  ].filter((c) => !!c)
  const needsGff = effects === "build" && !form.reference.gff
  return (
    <SuggestedBlock
      title={proposal.title}
      source={proposal.source}
      appliedAt={suggestion.appliedAt}
      onAccept={() => acceptOptions(draftId, proposal)}
      onDismiss={() => rejectSuggestion(draftId, proposal.id)}
    >
      <SuggestedValues
        rows={changes.map((c) => ({
          label: c.label,
          value:
            c.from === c.to ? (
              <span>
                {c.to}{" "}
                <span className="text-muted-foreground">(already set)</span>
              </span>
            ) : (
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate text-muted-foreground line-through">
                  {c.from}
                </span>
                <ArrowRightIcon className="size-3 shrink-0 text-muted-foreground" />
                <span className="truncate font-medium">{c.to}</span>
              </span>
            ),
        }))}
      />
      {needsGff && (
        <p className="text-[11px] text-muted-foreground">
          Build from GFF needs gene models: add a GFF3 file in step 1 first, or
          this step falls back to None.
        </p>
      )}
    </SuggestedBlock>
  )
}

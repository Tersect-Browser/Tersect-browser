import { useVirtualizer } from "@tanstack/react-virtual"
import { CircleAlertIcon, TriangleAlertIcon } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

import { SuggestedReference } from "../assistant/suggested-blocks"
import { formatBytes, formatCount } from "../format"
import {
  inlineIssues,
  isUnplaced,
  mainChromosomes,
  referenceIdFrom,
} from "../manifest"
import type { FileRef, InspectResult, SequenceInfo, WizardForm } from "../types"
import { useForm, useWizardStore } from "../wizard-store"
import { FileInput } from "./file-input"
import { sequenceSummary } from "./wizard-helpers"

export const FASTA_ACCEPT = ".fa,.fasta,.fna,.fa.gz,.fasta.gz,.fna.gz"
export const GFF_ACCEPT = ".gff,.gff3,.gff.gz,.gff3.gz"
const NAME_MAX = 100
/** Above this many selected sequences the amber alert suggests main chromosomes. */
const MANY_SEQUENCES = 100
const ROW_HEIGHT = 20
const VISIBLE_ROWS = 16

/* ----------------------------------------------------------- layout -- */

export function Field({
  id,
  label,
  htmlFor,
  required,
  aside,
  help,
  children,
}: {
  id?: string
  label: ReactNode
  htmlFor?: string
  required?: boolean
  aside?: ReactNode
  help?: ReactNode
  children: ReactNode
}) {
  return (
    <div id={id} className="flex scroll-mt-4 flex-col gap-1">
      <div className="flex items-baseline gap-2">
        <Label htmlFor={htmlFor}>
          {label}
          {required && (
            <span className="text-muted-foreground" aria-hidden>
              *
            </span>
          )}
        </Label>
        {aside && <span className="ml-auto">{aside}</span>}
      </div>
      {children}
      {help && <div className="text-[11px] text-muted-foreground">{help}</div>}
    </div>
  )
}

export function Section({
  title,
  children,
  aside,
}: {
  title: string
  children: ReactNode
  aside?: ReactNode
}) {
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2 border-b pb-1">
        <h2 className="caption">{title}</h2>
        {aside && <div className="ml-auto">{aside}</div>}
      </div>
      {children}
    </section>
  )
}

export function InlineError({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-1.5 rounded-lg border border-destructive bg-destructive/8 px-2 py-1.5 text-[11px]"
    >
      <CircleAlertIcon className="mt-px size-3 shrink-0 text-destructive" />
      <span>{children}</span>
    </div>
  )
}

/** Amber caution that does not block (6d, 6e). */
export function CautionNote({
  children,
  action,
}: {
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <div
      role="status"
      className="flex items-center gap-2 rounded-xl border border-(--viz-variant) px-2.5 py-2"
      style={{
        background: "color-mix(in oklch, var(--viz-variant) 10%, var(--card))",
      }}
    >
      <TriangleAlertIcon className="size-3.5 shrink-0 text-(--viz-variant)" />
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
  )
}

/** Read-only value row for add mode. */
export function ReadOnlyRow({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="grid grid-cols-[150px_1fr] items-baseline gap-2 py-0.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate font-mono">{children}</dd>
    </div>
  )
}

export function LockedNote({ base }: { base: string | null }) {
  return (
    <p className="rounded-xl border bg-muted px-2.5 py-2 text-muted-foreground">
      Adding accessions to{" "}
      <span className="font-mono text-foreground">
        {base ?? "this dataset"}
      </span>
      . The published values are kept and cannot be changed here.
    </p>
  )
}

/* ------------------------------------------------------ chromosomes -- */

function ChromosomeList({
  form,
  update,
}: {
  form: WizardForm
  update: (recipe: (f: WizardForm) => WizardForm) => void
}) {
  const sequences = useMemo(
    () => form.reference.sequences ?? [],
    [form.reference.sequences]
  )
  const selected = useMemo(
    () => new Set(form.reference.chromosomes),
    [form.reference.chromosomes]
  )
  const main = useMemo(() => mainChromosomes(sequences), [sequences])
  const maxLength = useMemo(
    () => Math.max(1, ...sequences.map((s) => s.length)),
    [sequences]
  )
  const [expanded, setExpanded] = useState(false)
  const collapsed = !expanded && sequences.length > MANY_SEQUENCES
  const rows = collapsed ? sequences.slice(0, MANY_SEQUENCES) : sequences
  const scrollRef = useRef<HTMLDivElement>(null)

  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: rows.length + (collapsed ? 1 : 0),
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  })

  const setChromosomes = (names: string[]) =>
    update((f) => ({ ...f, reference: { ...f.reference, chromosomes: names } }))

  const toggle = (sequence: SequenceInfo, on: boolean) => {
    const next = new Set(selected)
    if (on) next.add(sequence.name)
    else next.delete(sequence.name)
    // Keep FASTA order.
    setChromosomes(sequences.filter((s) => next.has(s.name)).map((s) => s.name))
  }

  const unplacedSelected = form.reference.chromosomes.filter(isUnplaced)
  const hasUnplaced = sequences.some((s) => isUnplaced(s.name))
  const isMain =
    main.length === selected.size && main.every((name) => selected.has(name))

  return (
    <div className="flex flex-col gap-2">
      {selected.size > MANY_SEQUENCES && (
        <CautionNote
          action={
            main.length > 0 && main.length <= MANY_SEQUENCES ? (
              <Button size="sm" onClick={() => setChromosomes(main)}>
                Select main chromosomes ({formatCount(main.length)})
              </Button>
            ) : undefined
          }
        >
          <span className="font-semibold">
            {formatCount(selected.size)} sequences are selected.
          </span>{" "}
          Every sequence becomes a chromosome in the browser, and more than{" "}
          {MANY_SEQUENCES} makes the build slow and the chromosome list hard to
          use.
        </CautionNote>
      )}

      <div className="flex items-center gap-2">
        <span
          className="font-mono text-[11px] text-muted-foreground"
          aria-live="polite"
        >
          {sequenceSummary(form)} selected
        </span>
        <div className="ml-auto flex gap-1">
          <Button
            variant="outline"
            size="sm"
            disabled={isMain || main.length === 0}
            onClick={() => setChromosomes(main)}
          >
            Select main chromosomes
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={selected.size === sequences.length}
            onClick={() => setChromosomes(sequences.map((s) => s.name))}
          >
            All
          </Button>
        </div>
      </div>

      <div
        ref={scrollRef}
        role="group"
        aria-label="Chromosomes to include"
        className="overflow-y-auto rounded-xl border bg-card py-1"
        style={{ maxHeight: ROW_HEIGHT * VISIBLE_ROWS + 8 }}
      >
        <div
          className="relative"
          style={{ height: virtualizer.getTotalSize() }}
        >
          {virtualizer.getVirtualItems().map((virtual) => {
            const style = {
              height: ROW_HEIGHT,
              transform: `translateY(${virtual.start}px)`,
            }
            if (virtual.index === rows.length) {
              return (
                <div
                  key="more"
                  className="absolute inset-x-0 top-0 flex items-center px-2.5"
                  style={style}
                >
                  <button
                    type="button"
                    className="text-[11px] text-primary underline-offset-2 hover:underline"
                    onClick={() => setExpanded(true)}
                  >
                    {formatCount(sequences.length - rows.length)} more sequences
                  </button>
                </div>
              )
            }
            const sequence = rows[virtual.index]
            const on = selected.has(sequence.name)
            const unplaced = isUnplaced(sequence.name)
            const id = `seq-${virtual.index}`
            return (
              <div
                key={sequence.name}
                className="absolute inset-x-0 top-0 grid grid-cols-[16px_minmax(80px,180px)_90px_1fr] items-center gap-2 px-2.5 hover:bg-muted"
                style={style}
              >
                <Checkbox
                  id={id}
                  checked={on}
                  onCheckedChange={(checked) =>
                    toggle(sequence, checked === true)
                  }
                  className="size-3.5"
                />
                <label
                  htmlFor={id}
                  className={cn(
                    "truncate font-mono text-[11px]",
                    !on && "text-muted-foreground"
                  )}
                >
                  {sequence.name}
                  {unplaced && (
                    <span className="ml-1.5 font-sans text-[10px] text-muted-foreground">
                      unplaced
                    </span>
                  )}
                </label>
                <span className="text-right font-mono text-[11px] text-muted-foreground">
                  {formatCount(sequence.length)}
                </span>
                <span className="h-1.5 rounded-[1px] bg-muted" aria-hidden>
                  <span
                    className={cn(
                      "block h-full rounded-[1px]",
                      on ? "bg-(--viz-ruler)" : "bg-muted-foreground/30"
                    )}
                    style={{ width: `${(sequence.length / maxLength) * 100}%` }}
                  />
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {hasUnplaced && unplacedSelected.length === 0 && (
        <p className="text-[11px] text-muted-foreground">
          Unplaced sequences (such as <span className="font-mono">ch00</span>{" "}
          and scaffolds) are left out by default.
        </p>
      )}
      {unplacedSelected.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          <span className="font-mono text-foreground">
            {unplacedSelected.slice(0, 3).join(", ")}
            {unplacedSelected.length > 3 &&
              ` and ${formatCount(unplacedSelected.length - 3)} more`}
          </span>{" "}
          {unplacedSelected.length === 1
            ? "is an unplaced sequence"
            : "are unplaced sequences"}
          . They are built like chromosomes, but variants on them rarely line up
          between accessions.
        </p>
      )}
    </div>
  )
}

/* ------------------------------------------------------------- step -- */

function ReadOnlyReference({ form }: { form: WizardForm }) {
  const base = useWizardStore((s) => s.draft?.base_dataset ?? null)
  return (
    <div className="flex max-w-[760px] flex-col gap-4 px-6 py-5">
      <LockedNote base={base} />
      <dl className="flex flex-col">
        <ReadOnlyRow label="Dataset">{form.name || base || "—"}</ReadOnlyRow>
        <ReadOnlyRow label="Description">{form.description || "—"}</ReadOnlyRow>
        <ReadOnlyRow label="Reference id">
          {form.reference.id || "—"}
        </ReadOnlyRow>
        <ReadOnlyRow label="Reference FASTA">
          {form.reference.fasta?.name ?? "—"}
        </ReadOnlyRow>
        <ReadOnlyRow label="Gene models">
          {form.reference.gff?.name ?? "None"}
        </ReadOnlyRow>
        <ReadOnlyRow label="Chromosomes">
          {form.reference.chromosomes.length
            ? `${formatCount(form.reference.chromosomes.length)}: ${form.reference.chromosomes.slice(0, 6).join(", ")}${form.reference.chromosomes.length > 6 ? ", …" : ""}`
            : "—"}
        </ReadOnlyRow>
      </dl>
    </div>
  )
}

export function StepReference({
  fix,
}: {
  fix?: { kind?: string; target?: string }
}) {
  const form = useForm()
  const draft = useWizardStore((s) => s.draft)
  const update = useWizardStore((s) => s.update)
  const [fastaNote, setFastaNote] = useState<string | null>(null)
  const draftId = draft?.id ?? ""

  const issues = useMemo(() => inlineIssues(form), [form])
  const gffIssue = issues.find((i) => i.kind === "gff-names")

  const onFasta = useCallback(
    (ref: FileRef | null) => {
      setFastaNote(null)
      update((f) => ({
        ...f,
        reference: {
          ...f.reference,
          fasta: ref,
          sequences: null,
          chromosomes: [],
          id: f.reference.id || (ref ? referenceIdFrom(ref.name) : ""),
        },
      }))
    },
    [update]
  )

  const onFastaInspect = useCallback(
    (result: InspectResult) => {
      if (result.error) return
      if (!result.sequences) {
        setFastaNote(result.note ?? null)
        return
      }
      const sequences = result.sequences
      update((f) => {
        const main = mainChromosomes(sequences)
        // A choice that came with the form (an imported manifest) is kept,
        // as far as the FASTA has those sequences. Picking a file in this
        // step empties the choice first, so then the main ones are selected.
        const names = new Set(sequences.map((s) => s.name))
        const chosen = f.reference.chromosomes.filter((c) => names.has(c))
        return {
          ...f,
          reference: {
            ...f.reference,
            sequences,
            chromosomes: chosen.length
              ? chosen
              : main.length
                ? main
                : sequences.map((s) => s.name),
            id:
              f.reference.id ||
              (f.reference.fasta
                ? referenceIdFrom(f.reference.fasta.name)
                : ""),
          },
        }
      })
    },
    [update]
  )

  const onGff = useCallback(
    (ref: FileRef | null) =>
      update((f) => ({
        ...f,
        reference: { ...f.reference, gff: ref, gffSeqids: null },
        // Build from GFF needs a GFF.
        options:
          !ref && f.options.effects === "build"
            ? { ...f.options, effects: "none" }
            : f.options,
      })),
    [update]
  )

  const onGffInspect = useCallback(
    (result: InspectResult) => {
      if (result.error || !result.seqids) return
      const seqids = result.seqids
      update((f) => ({
        ...f,
        reference: { ...f.reference, gffSeqids: seqids },
      }))
    },
    [update]
  )

  // "Fix and retry" or a Review link: bring the field into view.
  const fixKind = fix?.kind
  useEffect(() => {
    if (fixKind)
      document
        .getElementById(`field-${fixKind}`)
        ?.scrollIntoView({ block: "center" })
  }, [fixKind])

  if (draft?.mode === "add") return <ReadOnlyReference form={form} />

  // Dataset names are free text (manifest "id"): only control characters are refused.
  // eslint-disable-next-line no-control-regex
  const nameInvalid = /[\x00-\x1f\x7f]/.test(form.name)
  const fastaSize = form.reference.fasta?.size

  return (
    <div className="flex max-w-[760px] flex-col gap-6 px-6 py-5">
      <Section title="Dataset">
        <Field
          id="field-name"
          label="Name"
          htmlFor="dataset-name"
          required
          aside={
            <span
              className="font-mono text-[11px] text-muted-foreground"
              aria-live="polite"
            >
              {form.name.length} / {NAME_MAX}
            </span>
          }
          help={
            nameInvalid
              ? undefined
              : "Shown in the dataset list and used as its id. Up to 100 characters."
          }
        >
          <Input
            id="dataset-name"
            value={form.name}
            maxLength={NAME_MAX}
            required
            autoFocus={!form.name}
            aria-invalid={
              nameInvalid ||
              (fix?.kind === "name" && !form.name.trim()) ||
              undefined
            }
            placeholder="tomato_wild_relatives"
            onChange={(event) => {
              const name = event.target.value
              update((f) => ({ ...f, name }))
            }}
          />
          {nameInvalid && (
            <div className="text-[11px] text-destructive">
              The name cannot contain control characters such as tabs or line
              breaks.
            </div>
          )}
        </Field>
        <Field label="Description" htmlFor="dataset-description">
          <Textarea
            id="dataset-description"
            value={form.description}
            rows={2}
            className="min-h-12 text-xs md:text-xs"
            placeholder="What the accessions are and where the calls come from."
            onChange={(event) => {
              const description = event.target.value
              update((f) => ({ ...f, description }))
            }}
          />
        </Field>
      </Section>

      <Section title="Reference genome">
        <Field id="field-fasta" label="Reference FASTA" required>
          <FileInput
            kind="fasta"
            label="Reference FASTA"
            value={form.reference.fasta}
            onChange={onFasta}
            accept={FASTA_ACCEPT}
            dropLabel="Drop the reference FASTA here"
            help="Plain or bgzip-compressed (.fa, .fasta, .fa.gz). An index (.fai) is made if there is none."
            draftId={draftId}
            inspected={form.reference.sequences !== null}
            onInspect={onFastaInspect}
          />
        </Field>
        <Field
          id="field-gff"
          label="Gene models (GFF3)"
          aside={
            <span className="text-[11px] text-muted-foreground">Optional</span>
          }
        >
          <FileInput
            kind="gff"
            label="Gene models"
            value={form.reference.gff}
            onChange={onGff}
            accept={GFF_ACCEPT}
            dropLabel="Drop a GFF3 file here"
            help="Adds the gene track and lets the build predict variant effects."
            draftId={draftId}
            inspected={form.reference.gffSeqids !== null}
            onInspect={onGffInspect}
          />
          {gffIssue && <InlineError>{gffIssue.message}</InlineError>}
        </Field>
        <SuggestedReference />
        <Field
          id="field-reference-id"
          label="Reference id"
          htmlFor="reference-id"
          help="Taken from the FASTA file name."
        >
          <Input
            id="reference-id"
            value={form.reference.id}
            maxLength={100}
            onChange={(event) => {
              const id = event.target.value
              update((f) => ({ ...f, reference: { ...f.reference, id } }))
            }}
            className="w-[120px] font-mono"
          />
        </Field>
      </Section>

      <Section title="Chromosomes to include">
        {form.reference.sequences ? (
          form.reference.sequences.length ? (
            <ChromosomeList form={form} update={update} />
          ) : (
            <p className="text-muted-foreground">The FASTA has no sequences.</p>
          )
        ) : (
          <p className="rounded-xl border border-dashed px-3 py-4 text-center text-muted-foreground">
            {fastaNote ??
              "The sequence list appears here once the server has read the FASTA index."}
            {fastaSize != null && fastaNote && ` (${formatBytes(fastaSize)})`}
          </p>
        )}
      </Section>
    </div>
  )
}

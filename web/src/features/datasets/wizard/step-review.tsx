import { CircleAlertIcon, CircleCheckIcon, RotateCwIcon } from "lucide-react"
import type { ReactNode } from "react"
import { useSearchParams } from "react-router"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

import { formatCount } from "../format"
import {
  WIZARD_STEPS,
  type ManifestInput,
  type ValidationIssue,
  type WizardForm,
  type WizardStep,
} from "../types"
import { useForm, useWizardStore } from "../wizard-store"
import { useValidation } from "./validation"
import {
  STEP_TITLES,
  distanceLabel,
  effectsLabel,
  groupsOf,
  plural,
  sequenceSummary,
} from "./wizard-helpers"

/* ------------------------------------------------------ issue links -- */

export interface IssueLink {
  step: WizardStep
  /** Fix hint for the step (?fix=). */
  kind?: string
  /** Accession name the issue is about (?target=). */
  target?: string
  /** Link text, e.g. "Accessions · S.hab_LA1777". */
  label: string
}

const SAMPLE_FIELD_KINDS: Record<string, string> = {
  name: "name",
  label: "label",
  group: "group",
  vcf: "vcf",
  vcf_sample: "sample",
  rename_contigs: "rename-map",
}

const REFERENCE_FIELD_KINDS: Record<string, string> = {
  fasta: "fasta",
  gff: "gff",
  id: "reference-id",
  chromosomes: "chromosomes",
}

/** Where a server validation issue is fixed: step, row and hint. */
export function issueLink(
  issue: ValidationIssue,
  manifest: ManifestInput
): IssueLink {
  const field = issue.field
  const sample = field.match(/^samples\[(\d+)\](?:\.(\w+))?/)
  if (sample || issue.row != null) {
    const index = issue.row ?? Number(sample?.[1])
    const name = manifest.samples?.[index]?.name
    return {
      step: "accessions",
      kind: sample?.[2]
        ? (SAMPLE_FIELD_KINDS[sample[2]] ?? sample[2])
        : undefined,
      target: name,
      label: name ? `Accessions · ${name}` : `Accessions · row ${index + 1}`,
    }
  }
  if (field === "samples")
    return {
      step: "accessions",
      kind: "too-few",
      label: STEP_TITLES.accessions,
    }
  const reference = field.match(/^reference\.(\w+)/)
  if (reference) {
    return {
      step: "reference",
      kind: REFERENCE_FIELD_KINDS[reference[1]],
      label: STEP_TITLES.reference,
    }
  }
  if (field === "id" || field === "description") {
    return {
      step: "reference",
      kind: field === "id" ? "name" : undefined,
      label: STEP_TITLES.reference,
    }
  }
  if (/^(annotation|tersect|index)/.test(field)) {
    return {
      step: "options",
      kind: field.startsWith("index") ? "index" : undefined,
      label: STEP_TITLES.options,
    }
  }
  return { step: "reference", label: STEP_TITLES.reference }
}

/* ----------------------------------------------------------- blocks -- */

function SummaryCard({
  title,
  step,
  editable,
  children,
}: {
  title: string
  step: WizardStep
  editable: boolean
  children: ReactNode
}) {
  const setStep = useWizardStore((s) => s.setStep)
  return (
    <section
      aria-label={title}
      className="flex flex-col gap-1.5 rounded-xl border bg-card px-3 py-2.5"
    >
      <div className="flex items-center gap-2">
        <h2 className="caption">{title}</h2>
        <span className="font-mono text-t10 text-muted-foreground">
          Step {WIZARD_STEPS.indexOf(step) + 1}
        </span>
        {editable && (
          <Button
            variant="link"
            size="xs"
            className="ml-auto h-auto px-0 max-lg:min-h-11 pointer-coarse:min-h-11"
            onClick={() => setStep(step)}
          >
            Edit
          </Button>
        )}
      </div>
      <dl className="flex flex-col">{children}</dl>
    </section>
  )
}

function Row({
  label,
  children,
  mono = true,
}: {
  label: string
  children: ReactNode
  mono?: boolean
}) {
  return (
    <div className="grid grid-cols-[110px_1fr] items-baseline gap-2 py-px sm:grid-cols-[150px_1fr]">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={mono ? "min-w-0 font-mono text-t11 break-words" : "min-w-0"}
      >
        {children}
      </dd>
    </div>
  )
}

/** "4 uploaded files, 2 URLs (one multi-sample). Rename map on 3 files." */
export function filesSentence(form: WizardForm): string {
  const count = (source: string) =>
    form.vcfs.filter((v) => v.file.source === source).length
  const parts = [
    count("upload") && plural(count("upload"), "uploaded file"),
    count("url") && plural(count("url"), "URL"),
    count("server") && plural(count("server"), "server file"),
  ].filter(Boolean)
  if (!parts.length) return "No VCF files."
  const multi = form.vcfs.filter((v) => (v.samples?.length ?? 0) > 1).length
  const renamed = form.vcfs.filter(
    (v) => v.renameContigs && Object.keys(v.renameContigs).length
  ).length
  let text = parts.join(", ")
  if (multi)
    text += ` (${multi === 1 ? "one" : formatCount(multi)} multi-sample)`
  text += "."
  if (renamed) text += ` Rename map on ${plural(renamed, "file")}.`
  return text
}

function ValidationBlock({ form }: { form: WizardForm }) {
  const validation = useValidation(form, true)
  const [, setSearchParams] = useSearchParams()
  const issues = validation.data

  const go = (link: IssueLink) => {
    const params: Record<string, string> = { step: link.step }
    if (link.kind) params.fix = link.kind
    if (link.target) params.target = link.target
    setSearchParams(params)
  }

  const again = (
    <Button
      variant="outline"
      size="sm"
      disabled={validation.isFetching}
      onClick={() => void validation.refetch()}
    >
      {validation.isFetching ? (
        <Spinner className="size-3" />
      ) : (
        <RotateCwIcon />
      )}
      Validate again
    </Button>
  )

  if (validation.isPending) {
    return (
      <div
        role="status"
        className="flex items-center gap-2 rounded-xl border px-3 py-2.5 text-muted-foreground"
      >
        <Spinner className="size-3.5" /> The server is checking the manifest…
      </div>
    )
  }
  if (validation.isError) {
    return (
      <div
        role="alert"
        className="flex items-center gap-2 rounded-xl border border-destructive bg-destructive/8 px-3 py-2.5"
      >
        <CircleAlertIcon className="size-3.5 shrink-0 text-destructive" />
        <span className="flex-1">
          <span className="font-semibold text-destructive">
            Could not validate.
          </span>{" "}
          {validation.error.message}
        </span>
        {again}
      </div>
    )
  }
  if (!issues?.length) {
    return (
      <div
        role="status"
        className="flex items-center gap-2 rounded-xl border bg-accent/50 px-3 py-2.5"
      >
        <CircleCheckIcon className="size-3.5 shrink-0 text-primary" />
        <span className="flex-1">
          <span className="font-semibold">Validation passed</span>
          <span className="text-muted-foreground"> — Same checks as </span>
          <span className="font-mono text-t11">tb-dataset validate</span>
          <span className="text-muted-foreground">.</span>
        </span>
        {again}
      </div>
    )
  }
  return (
    <div
      role="alert"
      className="flex flex-col rounded-xl border border-destructive bg-destructive/6"
    >
      <div className="flex items-center gap-2 border-b border-destructive/30 px-3 py-2">
        <CircleAlertIcon className="size-3.5 shrink-0 text-destructive" />
        <span className="flex-1 font-semibold text-destructive">
          Server validation found {plural(issues.length, "problem")}
        </span>
        {again}
      </div>
      <ul className="flex flex-col py-1">
        {issues.map((issue, index) => {
          const link = issueLink(issue, validation.manifest)
          return (
            <li
              key={`${issue.field}-${index}`}
              className="grid grid-cols-1 items-baseline gap-x-2 gap-y-0.5 px-3 py-1 max-sm:py-2 sm:grid-cols-[150px_1fr_auto]"
            >
              <span className="truncate font-mono text-t11" title={issue.field}>
                {issue.field}
              </span>
              <span>{issue.message}</span>
              <Button
                variant="link"
                size="xs"
                className="h-auto justify-self-start px-0 max-lg:min-h-11 sm:justify-self-auto pointer-coarse:min-h-11"
                onClick={() => go(link)}
              >
                {link.label}
              </Button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/* ------------------------------------------------------------- step -- */

export function StepReview() {
  const form = useForm()
  const draft = useWizardStore((s) => s.draft)
  const addMode = draft?.mode === "add"
  const groups = groupsOf(form)
  const { reference, options } = form

  return (
    <div className="flex max-w-[760px] flex-col gap-4 px-4 pt-4 pb-7 sm:px-6 sm:py-5">
      <ValidationBlock form={form} />

      <SummaryCard title="Reference" step="reference" editable={!addMode}>
        <Row label="Dataset">{form.name.trim() || "—"}</Row>
        {form.description.trim() && (
          <Row label="Description" mono={false}>
            {form.description}
          </Row>
        )}
        <Row label="Reference id">{reference.id || "—"}</Row>
        <Row label="FASTA">{reference.fasta?.name ?? "—"}</Row>
        <Row label="Gene models">{reference.gff?.name ?? "None"}</Row>
        <Row label="Chromosomes">
          {sequenceSummary(form) ??
            `${formatCount(reference.chromosomes.length)} selected`}
        </Row>
      </SummaryCard>

      <SummaryCard title="Options" step="options" editable={!addMode}>
        <Row label="Variant effects" mono={false}>
          {effectsLabel(form)}
        </Row>
        <Row label="Distance index" mono={false}>
          {distanceLabel(form)}
        </Row>
        {options.useIndex && (
          <Row label="Index">{options.index?.name ?? "—"}</Row>
        )}
      </SummaryCard>

      <SummaryCard title="Accessions" step="accessions" editable>
        <Row label="Accessions">
          {addMode
            ? `${formatCount(draft?.base_accessions ?? 0)} existing + ${formatCount(form.accessions.length)} new`
            : options.useIndex && !form.accessions.length
              ? `${formatCount(options.indexSamples?.length ?? 0)} in the index`
              : formatCount(form.accessions.length)}
        </Row>
        <Row label="Groups" mono={false}>
          {groups.length ? (
            <ul className="flex flex-wrap gap-x-3 gap-y-0.5">
              {groups.map((group) => (
                <li key={group.name} className="flex items-center gap-1">
                  <span
                    className="size-2.5 rounded-[2px]"
                    style={{ background: group.color }}
                    aria-hidden
                  />
                  <span>{group.name}</span>
                  <span className="font-mono text-t11 text-muted-foreground">
                    {group.count}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <span className="text-muted-foreground">No groups</span>
          )}
        </Row>
        {!options.useIndex && (
          <Row label="Files" mono={false}>
            {filesSentence(form)}
          </Row>
        )}
      </SummaryCard>
    </div>
  )
}

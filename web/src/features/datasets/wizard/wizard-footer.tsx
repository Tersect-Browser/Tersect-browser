import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  DownloadIcon,
  HammerIcon,
} from "lucide-react"
import { useEffect, useState } from "react"
import { useNavigate } from "react-router"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

import { draftsQuery, manifestYaml, startBuild } from "../api"
import { toManifest } from "../manifest"
import type { Draft, WizardForm, WizardStep } from "../types"
import { WIZARD_STEPS } from "../types"
import { useWizardStore } from "../wizard-store"
import { useValidation } from "./validation"
import { useNarrow } from "./wizard-shell"
import {
  downloadText,
  formFiles,
  plural,
  useFormUploads,
} from "./wizard-helpers"

/** Why Continue is disabled on a step, or null when it is not. */
export function continueReason(
  step: WizardStep,
  form: WizardForm,
  addMode: boolean
): string | null {
  const { reference, options } = form
  switch (step) {
    case "reference":
      if (!addMode && !reference.fasta)
        return "Add a reference FASTA to continue"
      return null
    case "accessions":
      if (options.useIndex) return null
      if (addMode && form.accessions.length < 1)
        return "Add an accession to continue"
      if (!addMode && form.accessions.length < 2)
        return "Add at least two accessions to continue"
      return null
    case "options":
      if (addMode) return null
      if (options.useIndex && !options.index)
        return "Add the index file to continue"
      if (
        !options.useIndex &&
        options.effects === "prebuilt" &&
        !options.snpeffDb.trim()
      ) {
        return "Name the snpEff database to continue"
      }
      return null
    default:
      return null
  }
}

const HINTS: Record<WizardStep, string> = {
  reference: "Uploads keep going while you fill in the other steps.",
  accessions: "Changes are saved as a draft as you go.",
  options: "The defaults suit most datasets.",
  review: "You can leave the page while the dataset builds.",
}

function Reason({ id, children }: { id: string; children: string | null }) {
  if (!children) return null
  return (
    <span
      id={id}
      role="status"
      className="min-w-0 truncate text-[11px] text-muted-foreground"
      title={children}
    >
      {children}
    </span>
  )
}

function ReviewActions({ draft }: { draft: Draft }) {
  const form = draft.form
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const flush = useWizardStore((s) => s.flush)
  const validation = useValidation(form, true)
  const uploads = useFormUploads(draft.id, form)
  // A file whose upload has not been created yet is a placeholder (empty location).
  const placeholders = formFiles(form).filter(
    (f) => f.source === "upload" && !f.location
  )
  const waiting = [
    ...uploads.filter((u) => u.status !== "verified"),
    ...placeholders.map((f) => ({
      status: "uploading" as const,
      name: f.name,
    })),
  ]
  const stalled = waiting.filter((u) => u.status !== "uploading")
  // Build was clicked while uploads were still running: start once they finish.
  const [armed, setArmed] = useState(false)

  const download = useMutation({
    mutationFn: () => manifestYaml(toManifest(form)),
    onSuccess: (yaml) =>
      downloadText(yaml, `${form.name.trim() || "dataset"}.yaml`),
    onError: (error) =>
      toast.error("Could not download the manifest", {
        description: error.message,
      }),
  })

  const build = useMutation({
    mutationFn: async () => {
      await flush()
      return startBuild(
        toManifest(form),
        draft.id,
        draft.mode === "add" ? (draft.base_dataset ?? undefined) : undefined
      )
    },
    onSuccess: ({ id }) => {
      void queryClient.invalidateQueries({ queryKey: draftsQuery.queryKey })
      navigate(`/builds/${encodeURIComponent(id)}`)
    },
    onError: (error) => {
      setArmed(false)
      toast.error("The build could not start", { description: error.message })
    },
  })

  const problems = validation.data?.length ?? 0
  const blocked = validation.isPending
    ? "Validating…"
    : validation.isError
      ? "Validate the manifest to build"
      : problems
        ? `Fix ${plural(problems, "problem")} to build`
        : null
  const ready = !blocked && waiting.length === 0

  const { mutate: startNow, isPending: starting } = build
  useEffect(() => {
    if (armed && ready && !starting) startNow()
  }, [armed, ready, starting, startNow])

  const reason =
    blocked ??
    (waiting.length
      ? stalled.length
        ? `Waiting for ${plural(waiting.length, "upload")} (${stalled.length} paused or failed)`
        : `Waiting for ${plural(waiting.length, "upload")}`
      : null)

  return (
    <>
      <Reason id="build-reason">
        {armed && !blocked
          ? `${reason}. The build starts when they finish.`
          : reason}
      </Reason>
      <Button
        variant="outline"
        size="sm"
        disabled={download.isPending}
        onClick={() => download.mutate()}
      >
        {download.isPending ? <Spinner className="size-3" /> : <DownloadIcon />}
        Download manifest (YAML)
      </Button>
      {armed && !ready ? (
        <>
          <Button variant="ghost" size="sm" onClick={() => setArmed(false)}>
            Don't wait
          </Button>
          <Button size="sm" disabled aria-describedby="build-reason">
            <Spinner className="size-3" />
            Build dataset
          </Button>
        </>
      ) : (
        <Button
          size="sm"
          disabled={!!blocked || starting}
          aria-describedby={reason ? "build-reason" : undefined}
          onClick={() => (ready ? startNow() : setArmed(true))}
          title={
            !blocked && !ready
              ? "Starts the build as soon as the uploads finish"
              : undefined
          }
        >
          {starting ? <Spinner className="size-3" /> : <HammerIcon />}
          Build dataset
        </Button>
      )}
    </>
  )
}

/** Back or Cancel, the step's hint, and Continue (or Download and Build on Review). */
export function WizardFooter({ onCancel }: { onCancel: () => void }) {
  const draft = useWizardStore((s) => s.draft)
  const setStep = useWizardStore((s) => s.setStep)
  const narrow = useNarrow()
  if (!draft) return null
  const step = draft.step
  const addMode = draft.mode === "add"
  const index = WIZARD_STEPS.indexOf(step)
  const first = addMode ? WIZARD_STEPS.indexOf("accessions") : 0
  const reason = continueReason(step, draft.form, addMode)

  return (
    <footer className="flex h-11 shrink-0 items-center gap-2 border-t bg-card px-4">
      {index > first ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setStep(WIZARD_STEPS[index - 1])}
        >
          <ArrowLeftIcon />
          Back
        </Button>
      ) : null}
      <Button variant="ghost" size="sm" onClick={onCancel}>
        Cancel
      </Button>
      <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
        {narrow && step === "review" ? "" : HINTS[step]}
      </span>
      {step === "review" ? (
        <ReviewActions draft={draft} />
      ) : (
        <>
          <Reason id="continue-reason">{reason}</Reason>
          <Button
            size="sm"
            disabled={!!reason}
            aria-describedby={reason ? "continue-reason" : undefined}
            onClick={() => setStep(WIZARD_STEPS[index + 1])}
          >
            Continue
            <ArrowRightIcon />
          </Button>
        </>
      )}
    </footer>
  )
}

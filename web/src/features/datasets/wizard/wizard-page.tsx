import { useQuery, useQueryClient } from "@tanstack/react-query"
import { CircleAlertIcon } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { useNavigate, useParams, useSearchParams } from "react-router"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { BASE_URL } from "@/lib/config"

import { ApiError, deleteDraft, draftQuery, draftsQuery } from "../api"
import { requestExplain } from "../assistant/store"
import { WIZARD_STEPS, type WizardStep } from "../types"
import { useDraftUploads, useUploads } from "../uploads"
import { useWizardStore } from "../wizard-store"
import { LeaveDialog } from "./leave-dialog"
import { StepAccessions } from "./step-accessions"
import { StepOptions } from "./step-options"
import { StepReference } from "./step-reference"
import { StepReview } from "./step-review"
import { WizardFooter } from "./wizard-footer"
import { STEP_TITLES, useWizardUi } from "./wizard-helpers"
import { WizardShell } from "./wizard-shell"

interface Fix {
  /** Step the hint is for; undefined = whichever step is open. */
  step?: WizardStep
  kind?: string
  target?: string
  /** Changes on every new hint, so the step remounts and acts on it. */
  nonce: number
}

const isStep = (value: string | null): value is WizardStep =>
  WIZARD_STEPS.includes(value as WizardStep)

/** Path for navigate(), which adds the router basename itself. */
function routerPath(path: string): string {
  const base = BASE_URL.replace(/\/$/, "")
  return base && path.startsWith(base) ? path.slice(base.length) || "/" : path
}

function PageMessage({
  title,
  detail,
  actions,
}: {
  title: string
  detail?: string
  actions?: React.ReactNode
}) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div
        role="alert"
        className="flex max-w-[420px] flex-col items-center gap-2 text-center"
      >
        <CircleAlertIcon className="size-5 text-destructive" />
        <div className="text-sm font-semibold">{title}</div>
        {detail && <p className="text-muted-foreground">{detail}</p>}
        {actions && <div className="mt-1 flex gap-1.5">{actions}</div>}
      </div>
    </div>
  )
}

/** /datasets/drafts/:draftId: the dataset wizard, steps 1–4. */
export function WizardPage() {
  const { draftId = "" } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const query = useQuery({ ...draftQuery(draftId), retry: false })
  const draft = useWizardStore((s) => s.draft)
  const open = useWizardStore((s) => s.open)
  const setStep = useWizardStore((s) => s.setStep)
  const flush = useWizardStore((s) => s.flush)
  const saveState = useWizardStore((s) => s.saveState)
  const ready = draft?.id === draftId
  const discarded = useRef(false)

  /* open the draft; save, cache and close it on leaving */
  useEffect(() => {
    const loaded = query.data
    if (!loaded) return
    // Add mode starts at Accessions: reference and options are locked.
    open(
      loaded.mode === "add" && loaded.step === "reference"
        ? { ...loaded, step: "accessions" }
        : loaded
    )
    return () => {
      const store = useWizardStore.getState()
      const latest = store.draft
      if (!discarded.current) {
        void store.flush()
        // Returning to the wizard shows the latest edits, not the cached load.
        if (latest?.id === loaded.id && latest !== loaded) {
          queryClient.setQueryData(draftQuery(loaded.id).queryKey, latest)
        }
      }
      store.close()
      void queryClient.invalidateQueries({
        queryKey: draftsQuery.queryKey,
        exact: true,
      })
    }
  }, [query.data, open, queryClient])

  /* ?step=&fix=&target= ("Fix and retry", Review links): a one-shot command */
  const [searchParams, setSearchParams] = useSearchParams()
  const commandKey = searchParams.toString()
  const [seenCommand, setSeenCommand] = useState("")
  const [fix, setFix] = useState<Fix | null>(null)
  if (!commandKey && seenCommand) setSeenCommand("")
  if (commandKey && commandKey !== seenCommand) {
    setSeenCommand(commandKey)
    const step = searchParams.get("step")
    setFix({
      step: isStep(step) ? step : undefined,
      kind: searchParams.get("fix") ?? undefined,
      target: searchParams.get("target") ?? undefined,
      nonce: (fix?.nonce ?? 0) + 1,
    })
  }
  useEffect(() => {
    if (!ready || !commandKey) return
    const params = new URLSearchParams(commandKey)
    const step = params.get("step")
    if (isStep(step)) setStep(step)
    // ?assistant=error (a failed build's "Ask the assistant"): open the panel,
    // which explains the build once.
    if (params.get("assistant") === "error") {
      requestExplain(draftId)
      useWizardUi.setState({ assistantOpen: true })
    }
    setSearchParams({}, { replace: true })
  }, [ready, commandKey, draftId, setStep, setSearchParams])

  /* leaving */
  const uploads = useDraftUploads(ready ? draftId : undefined)
  const running = uploads.filter((u) => u.status === "uploading")
  const [leaveOpen, setLeaveOpen] = useState(false)
  const [leaveTo, setLeaveTo] = useState<string | null>(null)
  const [busy, setBusy] = useState<"discard" | "save" | null>(null)

  const guard =
    running.length > 0 || saveState === "error" || saveState === "saving"

  // A closed tab or reload: the browser asks; uploads resume on return.
  useEffect(() => {
    if (!guard) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [guard])

  // In-app links (top bar) while uploads run. The app uses <BrowserRouter>,
  // where react-router's useBlocker is not available, so links are caught here.
  useEffect(() => {
    if (!guard) return
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
        return
      const anchor = (event.target as Element | null)?.closest?.("a[href]")
      if (!(anchor instanceof HTMLAnchorElement)) return
      if (
        (anchor.target && anchor.target !== "_self") ||
        anchor.hasAttribute("download")
      )
        return
      const url = new URL(anchor.href, window.location.href)
      if (
        url.origin !== window.location.origin ||
        url.pathname === window.location.pathname
      )
        return
      event.preventDefault()
      event.stopPropagation()
      setLeaveTo(url.pathname + url.search + url.hash)
      setLeaveOpen(true)
    }
    document.addEventListener("click", onClick, true)
    return () => document.removeEventListener("click", onClick, true)
  }, [guard])

  const cancel = useCallback(() => {
    setLeaveTo(null)
    setLeaveOpen(true)
  }, [])

  const saveAndLeave = async () => {
    setBusy("save")
    try {
      await flush()
    } finally {
      setBusy(null)
    }
    if (useWizardStore.getState().saveState === "error") {
      toast.error("The draft could not be saved", {
        description:
          "Check that the dataset builder is running, then try again.",
      })
      return
    }
    const { pause } = useUploads.getState()
    for (const upload of running) pause(upload.key)
    setLeaveOpen(false)
    navigate(leaveTo ? routerPath(leaveTo) : "/")
  }

  const discard = async () => {
    setBusy("discard")
    try {
      await flush()
      await deleteDraft(draftId)
    } catch (error) {
      setBusy(null)
      toast.error("The draft could not be discarded", {
        description: (error as Error).message,
      })
      return
    }
    discarded.current = true
    const { remove } = useUploads.getState()
    for (const upload of uploads) remove(upload.key)
    queryClient.removeQueries({ queryKey: draftQuery(draftId).queryKey })
    setBusy(null)
    setLeaveOpen(false)
    navigate("/")
  }

  /* states */

  if (query.isError) {
    const missing =
      query.error instanceof ApiError && query.error.status === 404
    return (
      <PageMessage
        title={
          missing
            ? "This draft no longer exists"
            : "The draft could not be loaded"
        }
        detail={
          missing
            ? "It may have been discarded, or built into a dataset."
            : `The dataset builder did not answer: ${query.error.message}`
        }
        actions={
          <>
            {!missing && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void query.refetch()}
              >
                Try again
              </Button>
            )}
            <Button size="sm" onClick={() => navigate("/")}>
              Back to Home
            </Button>
          </>
        }
      />
    )
  }

  if (!ready || !draft) {
    return (
      <div
        role="status"
        className="flex h-full items-center justify-center gap-2 text-muted-foreground"
      >
        <Spinner /> Opening the draft…
      </div>
    )
  }

  const step = draft.step
  const stepFix =
    fix && (!fix.step || fix.step === step)
      ? { kind: fix.kind, target: fix.target }
      : undefined
  const key = `${step}-${stepFix ? fix?.nonce : 0}`
  const title =
    draft.mode === "add" && step === "accessions"
      ? "Add accessions"
      : STEP_TITLES[step]

  return (
    <>
      <WizardShell
        current={step}
        locked={false}
        title={title}
        footer={<WizardFooter onCancel={cancel} />}
      >
        {step === "reference" && <StepReference key={key} fix={stepFix} />}
        {step === "accessions" && (
          <div className="px-6 py-5">
            <StepAccessions key={key} fix={stepFix} />
          </div>
        )}
        {step === "options" && <StepOptions key={key} fix={stepFix} />}
        {step === "review" && <StepReview key={key} />}
      </WizardShell>
      <LeaveDialog
        open={leaveOpen}
        onOpenChange={setLeaveOpen}
        title={
          draft.mode === "add"
            ? "Leave adding accessions?"
            : "Leave the new dataset?"
        }
        uploading={running.length}
        busy={busy}
        onDiscard={() => void discard()}
        onSave={() => void saveAndLeave()}
      />
    </>
  )
}

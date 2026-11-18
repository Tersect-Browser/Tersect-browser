import { useQuery } from "@tanstack/react-query"
import {
  CheckIcon,
  CircleAlertIcon,
  HardDriveIcon,
  SparklesIcon,
} from "lucide-react"
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react"
import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

import { storageQuery } from "../api"
import { AssistantPanel } from "../assistant/assistant-panel"
import { useAssistantConfig } from "../assistant/config"
import { formatBytes, formatCount, formatTimeLeft, formatWhen } from "../format"
import { inlineIssues } from "../manifest"
import type { Draft, WizardStep } from "../types"
import { uploadTotals } from "../uploads"
import { useWizardStore } from "../wizard-store"
import {
  NARROW_WIDTH,
  RAIL_STEPS,
  STEP_TITLES,
  distanceLabel,
  effectsLabel,
  estimateNeed,
  groupsOf,
  plural,
  sequenceSummary,
  useFormUploads,
  useWizardUi,
} from "./wizard-helpers"

type ShellStep = WizardStep | "build" | "done"

/** True below 1200px of wizard width (rail 48px, summary as a strip). */
const NarrowContext = createContext(false)
export const useNarrow = () => useContext(NarrowContext)

/** Width of an element, kept current with a ResizeObserver. */
function useWidth() {
  const [width, setWidth] = useState<number | null>(null)
  const ref = useCallback((node: HTMLElement | null) => {
    if (!node) return
    const observer = new ResizeObserver(([entry]) =>
      setWidth(entry.contentRect.width)
    )
    observer.observe(node)
    setWidth(node.getBoundingClientRect().width)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}

/* ------------------------------------------------------------- rail -- */

function StepRail({
  current,
  locked,
  draft,
  narrow,
}: {
  current: ShellStep
  locked: boolean
  draft: Draft | null
  narrow: boolean
}) {
  const setStep = useWizardStore((s) => s.setStep)
  const currentIndex = RAIL_STEPS.indexOf(current)
  const issueSteps = useMemo(() => {
    if (!draft) return new Set<WizardStep>()
    return new Set(
      inlineIssues(draft.form, draft.mode === "add").map((i) => i.step)
    )
  }, [draft])

  return (
    <nav
      aria-label="Wizard steps"
      className={cn(
        "flex shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground",
        narrow ? "w-12" : "w-[184px]"
      )}
    >
      {!narrow && (
        <div className="caption px-3 pt-3 pb-1.5">
          {draft?.mode === "add" ? "Add accessions" : "New dataset"}
        </div>
      )}
      <ol
        className={cn(
          "flex flex-col gap-0.5",
          narrow ? "items-center pt-2" : "px-1.5"
        )}
      >
        {RAIL_STEPS.map((step, index) => {
          const isCurrent = index === currentIndex
          // Errors are flagged on steps already passed, and everywhere on Review.
          const flagged =
            issueSteps.has(step as WizardStep) &&
            (index < currentIndex || current === "review")
          const done =
            (index < currentIndex && !flagged) || (isCurrent && step === "done")
          const clickable = !locked && index < 4 && draft !== null
          const label = STEP_TITLES[step]
          const marker = (
            <span
              className={cn(
                "relative flex size-5 shrink-0 items-center justify-center rounded-full border font-mono text-[10px] font-medium",
                done
                  ? "border-primary bg-primary text-primary-foreground"
                  : isCurrent
                    ? "border-primary text-primary"
                    : "border-input text-muted-foreground"
              )}
            >
              {done ? <CheckIcon className="size-3" /> : index + 1}
              {narrow && flagged && (
                <CircleAlertIcon className="absolute -top-1 -right-1 size-2.5 rounded-full bg-sidebar text-destructive" />
              )}
            </span>
          )
          const content = (
            <>
              {marker}
              {!narrow && (
                <>
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-left",
                      isCurrent
                        ? "font-semibold"
                        : !done && "text-muted-foreground"
                    )}
                  >
                    {label}
                  </span>
                  {flagged && (
                    <CircleAlertIcon
                      aria-label="Has problems"
                      className="size-3.5 shrink-0 text-destructive"
                    />
                  )}
                </>
              )}
            </>
          )
          const rowClass = cn(
            "flex h-7 items-center gap-2 rounded-lg outline-none",
            narrow ? "w-8 justify-center" : "w-full px-1.5",
            isCurrent && "bg-sidebar-accent text-sidebar-accent-foreground"
          )
          const accessibleName = `Step ${index + 1}: ${label}${flagged ? " (has problems)" : ""}`
          const item = clickable ? (
            <button
              type="button"
              aria-current={isCurrent ? "step" : undefined}
              aria-label={narrow ? accessibleName : undefined}
              onClick={() => setStep(step as WizardStep)}
              className={cn(
                rowClass,
                "focus-visible:ring-2 focus-visible:ring-ring/30",
                !isCurrent && "hover:bg-sidebar-accent/60"
              )}
            >
              {content}
            </button>
          ) : (
            <span
              aria-current={isCurrent ? "step" : undefined}
              aria-label={narrow ? accessibleName : undefined}
              className={rowClass}
            >
              {content}
            </span>
          )
          return (
            <li key={step}>
              {narrow ? (
                <Tooltip>
                  <TooltipTrigger asChild>{item}</TooltipTrigger>
                  <TooltipContent side="right">{label}</TooltipContent>
                </Tooltip>
              ) : (
                item
              )}
            </li>
          )
        })}
      </ol>
      <div className="mt-auto">
        <StorageBox draft={draft} narrow={narrow} />
      </div>
    </nav>
  )
}

function StorageBox({
  draft,
  narrow,
}: {
  draft: Draft | null
  narrow: boolean
}) {
  const storage = useQuery(storageQuery)
  const need = draft ? estimateNeed(draft.form) : null
  const info = storage.data
  const tooLarge = info != null && need != null && need > info.free
  const freeText = info
    ? `${formatBytes(info.free)} free of ${formatBytes(info.total)}`
    : storage.isError
      ? "Storage unknown"
      : "Reading storage…"

  if (narrow) {
    return (
      <div className="flex justify-center pb-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              tabIndex={0}
              aria-label={`Server storage: ${freeText}`}
              className={cn(
                "flex size-7 items-center justify-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
                tooLarge ? "text-destructive" : "text-muted-foreground"
              )}
            >
              <HardDriveIcon className="size-3.5" />
            </span>
          </TooltipTrigger>
          <TooltipContent side="right">
            {freeText}
            {need != null && ` · needs about ${formatBytes(need)}`}
          </TooltipContent>
        </Tooltip>
      </div>
    )
  }

  const used =
    info && info.total > 0 ? (info.total - info.free) / info.total : 0
  const needShare =
    info && need != null && info.total > 0
      ? Math.min(need / info.total, 1 - used)
      : 0
  return (
    <section
      aria-label="Server storage"
      className="flex flex-col gap-1.5 border-t px-3 py-3"
    >
      <div className="caption">Server storage</div>
      <div className="relative flex h-1 overflow-hidden rounded-full bg-muted">
        <span
          className="h-full bg-muted-foreground/50"
          style={{ width: `${used * 100}%` }}
        />
        <span
          className={cn("h-full", tooLarge ? "bg-destructive" : "bg-primary")}
          style={{ width: `${needShare * 100}%` }}
        />
      </div>
      <div className="font-mono text-[11px]">{freeText}</div>
      {need != null && (
        <p className="text-[11px] text-muted-foreground">
          This dataset needs about{" "}
          <span className="font-mono text-foreground">{formatBytes(need)}</span>{" "}
          (an estimate from the file sizes).
        </p>
      )}
      {tooLarge && (
        <p className="flex gap-1 text-[11px] text-destructive">
          <CircleAlertIcon className="mt-px size-3 shrink-0" />
          That is more than the free space. Free some space before building.
        </p>
      )}
    </section>
  )
}

/* ---------------------------------------------------------- summary -- */

function useSummary(draft: Draft) {
  const form = draft.form
  const uploads = useFormUploads(draft.id, form)
  const totals = uploadTotals(uploads)
  const groups = groupsOf(form)
  const accessions = form.options.useIndex
    ? form.options.indexSamples
      ? `${plural(form.options.indexSamples.length, "sample")} in the index`
      : "From the index"
    : draft.mode === "add"
      ? `${formatCount(draft.base_accessions ?? 0)} existing + ${formatCount(form.accessions.length)} new`
      : `${formatCount(form.accessions.length)} in ${plural(groups.length, "group")}`
  return { form, uploads, totals, groups, accessions }
}

function SummaryItem({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="caption">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  )
}

const Muted = ({ children }: { children: ReactNode }) => (
  <span className="text-muted-foreground">{children}</span>
)

function SaveLine() {
  const saveState = useWizardStore((s) => s.saveState)
  const updatedAt = useWizardStore((s) => s.draft?.updated_at)
  const update = useWizardStore((s) => s.update)
  if (saveState === "error") {
    return (
      <div
        role="status"
        className="flex items-center gap-1 text-[11px] text-destructive"
      >
        <CircleAlertIcon className="size-3 shrink-0" />
        Draft not saved.
        <button
          type="button"
          className="underline underline-offset-2"
          // An identity update schedules another save.
          onClick={() => update((form) => ({ ...form }))}
        >
          Retry
        </button>
      </div>
    )
  }
  return (
    <div role="status" className="text-[11px] text-muted-foreground">
      {saveState === "saving"
        ? "Saving draft…"
        : `Draft saved${updatedAt ? ` · ${formatWhen(updatedAt)}` : ""}`}
    </div>
  )
}

function SummaryColumn({ draft }: { draft: Draft }) {
  const { form, totals, groups, accessions } = useSummary(draft)
  const sequences = sequenceSummary(form)
  const percent =
    totals.size > 0 ? Math.round((totals.sent / totals.size) * 100) : 0

  return (
    <aside
      aria-label="Dataset summary"
      className="flex w-[236px] shrink-0 flex-col gap-3 overflow-y-auto border-l bg-card px-3 py-3"
    >
      <dl className="flex flex-col gap-3">
        <SummaryItem label="Dataset">
          {form.name.trim() ? (
            <div className="truncate font-mono">{form.name}</div>
          ) : (
            <Muted>Not named yet</Muted>
          )}
          {form.description.trim() && (
            <div className="line-clamp-2 text-[11px] text-muted-foreground">
              {form.description}
            </div>
          )}
        </SummaryItem>
        <SummaryItem label="Reference">
          {form.reference.id || form.reference.fasta ? (
            <>
              <div className="truncate font-mono">
                {form.reference.id || "—"}
              </div>
              <div className="font-mono text-[11px] text-muted-foreground">
                {sequences ??
                  (form.reference.fasta ? "Reading the FASTA…" : "")}
              </div>
            </>
          ) : (
            <Muted>No FASTA yet</Muted>
          )}
        </SummaryItem>
        <SummaryItem label="Gene models">
          {form.reference.gff ? (
            <div className="truncate font-mono" title={form.reference.gff.name}>
              {form.reference.gff.name}
            </div>
          ) : (
            <Muted>None</Muted>
          )}
        </SummaryItem>
        <SummaryItem label="Accessions">
          <div className="font-mono">{accessions}</div>
          {groups.length > 0 && (
            <ul className="mt-1 flex flex-wrap gap-1" aria-label="Groups">
              {groups.map((group) => (
                <li key={group.name}>
                  <span
                    title={`${group.name}: ${group.count}`}
                    className="block size-2.5 rounded-[2px]"
                    style={{ background: group.color }}
                  />
                </li>
              ))}
            </ul>
          )}
        </SummaryItem>
        <SummaryItem label="Variant effects">{effectsLabel(form)}</SummaryItem>
        <SummaryItem label="Distance index">{distanceLabel(form)}</SummaryItem>
        {totals.files > 0 && (
          <SummaryItem label="Uploads">
            <div className="flex flex-col gap-1">
              <div className="h-[3px] overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full",
                    totals.failed ? "bg-destructive" : "bg-primary"
                  )}
                  style={{ width: `${percent}%` }}
                />
              </div>
              <div className="flex justify-between font-mono text-[11px]">
                <span>
                  {totals.done} of {totals.files} files
                </span>
                <span>{percent}%</span>
              </div>
              {totals.pending && (
                <div className="text-[11px] text-muted-foreground">
                  {[
                    totals.uploading > 0 && formatTimeLeft(totals.secondsLeft),
                    totals.paused > 0 && `${totals.paused} paused`,
                    totals.failed > 0 && `${totals.failed} failed`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}{" "}
                  The build waits for uploads to finish.
                </div>
              )}
            </div>
          </SummaryItem>
        )}
      </dl>
      <div className="mt-auto border-t pt-2">
        <SaveLine />
      </div>
    </aside>
  )
}

/** One-line summary under the header below 1200px. */
function SummaryStrip({ draft }: { draft: Draft }) {
  const { form, totals, accessions } = useSummary(draft)
  const sequences = sequenceSummary(form)
  const saveState = useWizardStore((s) => s.saveState)
  const percent =
    totals.size > 0 ? Math.round((totals.sent / totals.size) * 100) : 0
  const parts = [
    form.name.trim() || "unnamed",
    [form.reference.id, sequences].filter(Boolean).join(" "),
    form.reference.gff?.name ?? "no GFF",
    accessions,
    `effects: ${effectsLabel(form)}`,
    distanceLabel(form),
    totals.pending && `uploads ${percent}%`,
    saveState === "saving"
      ? "saving…"
      : saveState === "error"
        ? "not saved"
        : "saved",
  ].filter(Boolean)
  return (
    <div
      aria-label="Dataset summary"
      className="flex h-[26px] shrink-0 items-center border-b bg-card px-4 font-mono text-[11px] text-muted-foreground"
    >
      <span className="truncate" title={parts.join(" · ")}>
        {parts.join(" · ")}
      </span>
    </div>
  )
}

/* ------------------------------------------------------------ shell -- */

/** Rail, header, scrolling body, footer and summary of the dataset wizard. */
export function WizardShell(props: {
  current: WizardStep | "build" | "done"
  locked: boolean
  title: string
  headerActions?: React.ReactNode
  footer?: React.ReactNode
  children: React.ReactNode
}) {
  const { current, locked, title, headerActions, footer, children } = props
  const [ref, width] = useWidth()
  const narrow = width !== null && width < NARROW_WIDTH
  const draft = useWizardStore((s) => s.draft)
  const assistant = useAssistantConfig()
  const assistantOpen = useWizardUi((s) => s.assistantOpen)
  const toggleAssistant = useWizardUi((s) => s.toggleAssistant)
  const stepNumber = RAIL_STEPS.indexOf(current) + 1
  // The assistant fills in the form, so it is offered on steps 1–4 only.
  const formStep = !locked && current !== "build" && current !== "done"
  const showAssistant = assistant.enabled && formStep && draft !== null
  const closeAssistant = () => {
    toggleAssistant()
    document.getElementById("assistant-toggle")?.focus()
  }

  return (
    <NarrowContext.Provider value={narrow}>
      <div ref={ref} className="flex h-full min-h-0">
        <StepRail
          current={current}
          locked={locked}
          draft={draft}
          narrow={narrow}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-11 shrink-0 items-center gap-3 border-b px-4">
            <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
              Step {stepNumber} of 6
            </span>
            <h1 className="min-w-0 truncate text-[15px] font-semibold">
              {title}
            </h1>
            <div className="ml-auto flex shrink-0 items-center gap-1.5">
              {headerActions}
              {showAssistant && (
                <Button
                  id="assistant-toggle"
                  variant={assistantOpen ? "secondary" : "outline"}
                  size="sm"
                  aria-pressed={assistantOpen}
                  onClick={toggleAssistant}
                >
                  <SparklesIcon />
                  Assistant
                </Button>
              )}
            </div>
          </header>
          {narrow && draft && <SummaryStrip draft={draft} />}
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
          {footer}
        </div>
        {!narrow && draft && <SummaryColumn draft={draft} />}
        {showAssistant && assistantOpen && formStep && (
          <AssistantPanel
            step={current}
            narrow={narrow}
            onClose={closeAssistant}
          />
        )}
      </div>
    </NarrowContext.Provider>
  )
}

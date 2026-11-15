/**
 * Dataset assistant (section 9, 4a–4e): a chat docked right of the wizard.
 * It reads and proposes; proposals become SUGGESTED values in the form that
 * the user accepts there. It cannot start a build.
 */
import { useQueryClient } from "@tanstack/react-query"
import {
  ArrowUpIcon,
  BookOpenIcon,
  BotIcon,
  BrainIcon,
  ChevronRightIcon,
  CircleAlertIcon,
  CircleHelpIcon,
  RotateCwIcon,
  ShieldCheckIcon,
  SquareIcon,
  TableIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"
import type { KeyboardEvent } from "react"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

import { buildQuery } from "../api"
import type { WizardStep } from "../types"
import { useWizardStore } from "../wizard-store"
import { useAssistantConfig } from "./config"
import { Markdown } from "./markdown"
import { ProposalCard } from "./proposal-card"
import {
  clearConversation,
  explainBuild,
  retry,
  send,
  stop,
  takeExplain,
  useAssistantSettings,
  useAssistantStore,
  useConversation,
  type AssistantMessage,
  type AssistantPart,
  type BuildContext,
} from "./store"

const STARTERS = [
  {
    icon: BookOpenIcon,
    title: "Replicate a paper",
    detail: "Paste a DOI or link; it finds the reference and the VCFs.",
    prompt: "Replicate the dataset from this paper: ",
  },
  {
    icon: TableIcon,
    title: "Fill the accession sheet",
    detail:
      "Paste a table in any shape; labels and groups are matched by name.",
    prompt: "Fill the accession sheet from this table:\n",
  },
  {
    icon: CircleHelpIcon,
    title: "Explain an option",
    detail: "Ask about variant effects, variant types or homozygous only.",
    prompt: "Should I use homozygous only for ",
  },
]

/** Docked panel; the shell mounts it while open. */
export function AssistantPanel({
  step,
  narrow,
  onClose,
}: {
  step: WizardStep
  narrow: boolean
  onClose: () => void
}) {
  const draftId = useWizardStore((s) => s.draft?.id)
  const buildId = useWizardStore((s) => s.draft?.build_id ?? null)
  const { model } = useAssistantConfig()
  const conversation = useConversation(draftId)
  const queryClient = useQueryClient()
  const [input, setInput] = useState("")
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const logRef = useRef<HTMLDivElement>(null)

  const messages = conversation.messages
  const last = messages[messages.length - 1]
  const current =
    last?.role === "assistant" ? (last as AssistantMessage) : undefined
  const running = current?.state === "running"
  const failed = current?.state === "error"

  /* focus the input on open */
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  /* "Ask the assistant" on a failed build: explain it, once */
  const explain = useAssistantStore(
    (s) => !!draftId && s.explainPending === draftId
  )
  useEffect(() => {
    if (!explain || !draftId || !takeExplain(draftId)) return
    const ask = (build: BuildContext | null) => explainBuild(draftId, build)
    if (!buildId) return ask(null)
    queryClient.fetchQuery(buildQuery(buildId)).then(
      (b) => ask({ id: b.id, status: b.status, error: b.error, log: b.log }),
      () => ask(null)
    )
  }, [explain, draftId, buildId, queryClient])

  /* keep the newest message in view, unless the user scrolled up */
  const stick = useRef(true)
  const progress =
    current?.parts.reduce(
      (n, p) => n + (p.type === "proposal" ? 1000 : p.text.length),
      0
    ) ?? 0
  useEffect(() => {
    const log = logRef.current
    if (log && stick.current) log.scrollTop = log.scrollHeight
  }, [messages.length, progress, current?.status])

  if (!draftId) return null

  const submit = () => {
    if (running || !input.trim()) return
    stick.current = true
    send(draftId, input, step)
    setInput("")
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault()
      submit()
    }
  }

  const prefill = (prompt: string) => {
    setInput(prompt)
    requestAnimationFrame(() => {
      const el = inputRef.current
      if (!el) return
      el.focus()
      el.setSelectionRange(prompt.length, prompt.length)
    })
  }

  return (
    <aside
      aria-label="Dataset assistant"
      className={cn(
        "flex shrink-0 flex-col border-l bg-card",
        narrow ? "w-[300px]" : "w-[340px]"
      )}
    >
      <header className="flex h-11 shrink-0 items-center gap-2 border-b pr-2 pl-3">
        <BotIcon className="size-4 shrink-0 text-primary" />
        <h2 className="min-w-0 flex-1 truncate font-semibold">
          Dataset assistant
        </h2>
        <ReasoningToggle />
        {messages.length > 0 && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Clear the conversation"
            title="Clear the conversation"
            disabled={running}
            onClick={() => clearConversation(draftId)}
          >
            <Trash2Icon />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Close the assistant"
          onClick={onClose}
        >
          <XIcon />
        </Button>
      </header>

      <p className="flex shrink-0 gap-1.5 border-b bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground">
        <ShieldCheckIcon className="mt-px size-3 shrink-0" />
        <span className="text-pretty">
          Runs on this server with a local open-weight model
          {model ? (
            <>
              {" "}
              (<span className="font-mono">{model}</span>)
            </>
          ) : null}
          . No paper, file name or genotype leaves the machine. It fills in the
          form; it cannot start a build.
        </span>
      </p>

      <div
        ref={logRef}
        role="log"
        aria-live="polite"
        aria-label="Conversation"
        onScroll={(event) => {
          const el = event.currentTarget
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
        }}
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 py-3"
      >
        {messages.length === 0 ? (
          <Starters onPick={prefill} />
        ) : (
          messages.map((message) =>
            message.role === "user" ? (
              <div
                key={message.id}
                className="ml-8 self-end rounded-lg bg-secondary px-2.5 py-1.5 break-words whitespace-pre-wrap text-secondary-foreground"
              >
                {message.text}
              </div>
            ) : (
              <AssistantTurn
                key={message.id}
                draftId={draftId}
                message={message}
              />
            )
          )
        )}
      </div>

      <div className="flex shrink-0 flex-col gap-1.5 border-t px-3 pt-2 pb-3">
        {running && (
          <div
            role="status"
            className="flex min-h-6 items-center gap-1.5 text-[11px] text-muted-foreground"
          >
            <Spinner className="size-3 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1 truncate">
              {current?.status ?? "Thinking…"}
            </span>
            <Button variant="outline" size="xs" onClick={() => stop(draftId)}>
              <SquareIcon className="size-2.5 fill-current" /> Stop
            </Button>
          </div>
        )}
        {failed && (
          <div
            role="alert"
            className="flex items-start gap-1.5 rounded-md border border-destructive bg-destructive/8 px-2 py-1.5 text-[11px]"
          >
            <CircleAlertIcon className="mt-px size-3 shrink-0 text-destructive" />
            <span className="min-w-0 flex-1 break-words">
              {current?.error ?? "The assistant stopped with an error."}
            </span>
            <Button
              variant="outline"
              size="xs"
              className="-my-0.5"
              onClick={() => retry(draftId, step)}
            >
              <RotateCwIcon /> Retry
            </Button>
          </div>
        )}
        <div className="relative">
          <label htmlFor="assistant-input" className="sr-only">
            Message the assistant
          </label>
          <textarea
            id="assistant-input"
            ref={inputRef}
            value={input}
            rows={2}
            placeholder="Paste a DOI, a table or a question…"
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={onKeyDown}
            className="block field-sizing-content max-h-40 min-h-[52px] w-full resize-none rounded-md border border-input bg-background py-1.5 pr-9 pl-2.5 text-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
          />
          <Button
            size="icon-sm"
            aria-label="Send"
            className="absolute right-1.5 bottom-1.5"
            disabled={running || !input.trim()}
            onClick={submit}
          >
            <ArrowUpIcon />
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Enter sends · Shift+Enter for a new line
        </p>
      </div>
    </aside>
  )
}

function Starters({ onPick }: { onPick: (prompt: string) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted-foreground">
        It reads papers, server folders and tables you paste, and proposes
        values for the form. You accept each one in the form.
      </p>
      <h3 className="caption mt-1">Start with</h3>
      <ul className="flex flex-col gap-1.5">
        {STARTERS.map(({ icon: Icon, title, detail, prompt }) => (
          <li key={title}>
            <button
              type="button"
              onClick={() => onPick(prompt)}
              className="flex w-full items-start gap-2 rounded-md border bg-background px-2.5 py-2 text-left outline-none hover:bg-accent focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
            >
              <Icon className="mt-px size-3.5 shrink-0 text-primary" />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="font-medium">{title}</span>
                <span className="text-[11px] text-muted-foreground">
                  {detail}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function AssistantTurn({
  draftId,
  message,
}: {
  draftId: string
  message: AssistantMessage
}) {
  if (!message.parts.length && message.state !== "stopped") return null
  return (
    <div className="flex flex-col gap-2">
      {message.parts.map((part, i) =>
        part.type === "thinking" ? (
          <ThinkingBlock key={i} part={part} />
        ) : part.type === "text" ? (
          <Markdown key={i} text={part.text} />
        ) : (
          <ProposalCard
            key={part.proposal.id}
            draftId={draftId}
            proposal={part.proposal}
            state={part.state}
          />
        )
      )}
      {message.state === "stopped" && (
        <p className="text-[11px] text-muted-foreground italic">Stopped.</p>
      )}
    </div>
  )
}

/** Header switch: ask the model to reason first and show that reasoning. */
function ReasoningToggle() {
  const on = useAssistantSettings((s) => s.showReasoning)
  const setOn = useAssistantSettings((s) => s.setShowReasoning)
  const label = on
    ? "Hide reasoning (faster answers)"
    : "Show reasoning (slower: the model thinks before answering)"
  return (
    <Button
      variant={on ? "secondary" : "ghost"}
      size="icon-sm"
      aria-pressed={on}
      aria-label={label}
      title={label}
      onClick={() => setOn(!on)}
    >
      <BrainIcon className={on ? "text-primary" : undefined} />
    </Button>
  )
}

/**
 * The model's reasoning before a step, collapsed by default. While it is
 * thinking the header says so (with a spinner); afterwards, for how long.
 */
function ThinkingBlock({
  part,
}: {
  part: Extract<AssistantPart, { type: "thinking" }>
}) {
  const [open, setOpen] = useState(false)
  const active = part.endedAt === null
  // Shown only once it has ended, so the duration is fixed.
  const seconds =
    part.endedAt === null
      ? 0
      : Math.max(1, Math.round((part.endedAt - part.startedAt) / 1000))
  const bodyRef = useRef<HTMLDivElement>(null)
  // Follow the newest reasoning while it streams in an open block.
  useEffect(() => {
    const body = bodyRef.current
    if (open && active && body) body.scrollTop = body.scrollHeight
  }, [open, active, part.text])
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex w-fit items-center gap-1 rounded-sm text-[11px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30"
      >
        <ChevronRightIcon
          className={cn("size-3 transition-transform", open && "rotate-90")}
        />
        {active ? (
          <>
            Thinking <Spinner className="size-3" />
          </>
        ) : (
          `Thought for ${seconds} s`
        )}
      </button>
      {open && (
        <div
          ref={bodyRef}
          className="max-h-60 overflow-y-auto border-l-2 pl-2.5 text-[11px] leading-relaxed whitespace-pre-wrap text-muted-foreground"
        >
          {part.text.trim()}
        </div>
      )}
    </div>
  )
}

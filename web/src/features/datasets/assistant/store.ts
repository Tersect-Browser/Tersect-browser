/**
 * The assistant conversation of each draft, kept in sessionStorage so a
 * reload keeps it. The whole conversation is resent on every turn
 * (assistant turns as the text they streamed), with the current form.
 */
import { create } from "zustand"
import { persist } from "zustand/middleware"

import type { Build, WizardStep } from "../types"
import { useWizardStore } from "../wizard-store"
import { streamAssistant } from "./api"
import { localJsonStorage, sessionJsonStorage } from "./storage"
import type { AssistantRequest, ChatMessage, Proposal } from "./types"

/**
 * open: buttons shown; applied: shown as a suggestion in the form;
 * accepted / rejected: the user accepted or dismissed that suggestion;
 * dismissed: dismissed on the card.
 */
export type ProposalState =
  "open" | "applied" | "accepted" | "rejected" | "dismissed"

export type AssistantPart =
  | { type: "text"; text: string }
  /** The model's reasoning before a step; times in ms since the epoch. */
  | {
      type: "thinking"
      text: string
      startedAt: number
      endedAt: number | null
    }
  | { type: "proposal"; proposal: Proposal; state: ProposalState }

export interface UserMessage {
  id: string
  role: "user"
  text: string
}

export interface AssistantMessage {
  id: string
  role: "assistant"
  parts: AssistantPart[]
  /** What it is doing, while running ("Reading Table S1…"). */
  status: string | null
  state: "running" | "done" | "stopped" | "error"
  error: string | null
}

export type Message = UserMessage | AssistantMessage

export type BuildContext = Pick<Build, "id" | "status" | "error" | "log">

export interface Conversation {
  messages: Message[]
  /** The failed build being explained; sent with every later turn too. */
  build: BuildContext | null
}

interface AssistantState {
  conversations: Record<string, Conversation>
  /** Draft whose next panel mount should explain its failed build. */
  explainPending: string | null
}

const EMPTY: Conversation = { messages: [], build: null }

export const useAssistantStore = create<AssistantState>()(
  persist((): AssistantState => ({ conversations: {}, explainPending: null }), {
    name: "tb.assistant.conversations",
    storage: sessionJsonStorage(),
    partialize: (s) => ({ conversations: s.conversations }) as AssistantState,
    // A reload ends any answer that was streaming.
    merge: (persisted, current) => {
      const stored = (persisted as Partial<AssistantState> | undefined)
        ?.conversations
      if (!stored) return current
      const conversations: Record<string, Conversation> = {}
      for (const [id, c] of Object.entries(stored)) {
        conversations[id] = {
          ...c,
          messages: c.messages.map((m) =>
            m.role === "assistant" && m.state === "running"
              ? { ...m, state: "stopped", status: null }
              : m
          ),
        }
      }
      return { ...current, conversations }
    },
  })
)

export const useConversation = (draftId: string | undefined): Conversation =>
  useAssistantStore((s) => (draftId && s.conversations[draftId]) || EMPTY)

/* ---------------------------------------------------------- editing -- */

const newMessageId = () => Math.random().toString(36).slice(2, 10)

function edit(draftId: string, recipe: (c: Conversation) => Conversation) {
  useAssistantStore.setState((s) => ({
    conversations: {
      ...s.conversations,
      [draftId]: recipe(s.conversations[draftId] ?? EMPTY),
    },
  }))
}

function editMessage(
  draftId: string,
  messageId: string,
  recipe: (m: AssistantMessage) => AssistantMessage
) {
  edit(draftId, (c) => ({
    ...c,
    messages: c.messages.map((m) =>
      m.id === messageId && m.role === "assistant" ? recipe(m) : m
    ),
  }))
}

export function setProposalState(
  draftId: string,
  proposalId: string,
  state: ProposalState
) {
  edit(draftId, (c) => ({
    ...c,
    messages: c.messages.map((m) =>
      m.role !== "assistant"
        ? m
        : {
            ...m,
            parts: m.parts.map((p) =>
              p.type === "proposal" && p.proposal.id === proposalId
                ? { ...p, state }
                : p
            ),
          }
    ),
  }))
}

export function clearConversation(draftId: string) {
  stop(draftId)
  useAssistantStore.setState((s) => {
    const conversations = { ...s.conversations }
    delete conversations[draftId]
    return { conversations }
  })
}

/* ---------------------------------------------------------- sending -- */

/** Text of an assistant turn, as sent back in the history. */
export function messageText(message: AssistantMessage): string {
  return message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("\n\n")
    .trim()
}

function history(messages: Message[]): ChatMessage[] {
  return messages
    .filter((m) => m.role === "user" || m.state !== "error")
    .map((m) =>
      m.role === "user"
        ? { role: "user", content: m.text }
        : {
            role: "assistant",
            content: historyText(m),
          }
    )
}

const PROPOSAL_OUTCOME: Record<ProposalState, string> = {
  open: "not acted on yet",
  applied: "shown in the form, awaiting the user's Accept",
  accepted: "accepted by the user",
  rejected: "dismissed by the user in the form",
  dismissed: "dismissed by the user",
}

/**
 * An assistant turn as the model sees it next time: its text plus one line
 * per proposal it made and what the user did with it, so follow-ups can refer
 * to them ("the accessions you proposed").
 */
function historyText(message: AssistantMessage): string {
  const proposals = message.parts.flatMap((p) =>
    p.type === "proposal"
      ? [
          `[Proposal "${p.proposal.title}": ${PROPOSAL_OUTCOME[p.state] ?? p.state}]`,
        ]
      : []
  )
  return [
    messageText(message) || "(The answer was stopped.)",
    ...proposals,
  ].join("\n")
}

const running = new Map<string, AbortController>()

/** Stop the answer being streamed, keeping what arrived. */
export function stop(draftId: string) {
  running.get(draftId)?.abort()
}

async function run(draftId: string, step: WizardStep | "build") {
  stop(draftId)
  const conversation =
    useAssistantStore.getState().conversations[draftId] ?? EMPTY
  const draft = useWizardStore.getState().draft
  const request: AssistantRequest = {
    think: useAssistantSettings.getState().showReasoning,
    messages: history(conversation.messages),
    context: {
      draft_id: draftId,
      step,
      form: draft?.id === draftId ? draft.form : null,
      build: conversation.build,
    },
  }
  const id = newMessageId()
  const message: AssistantMessage = {
    id,
    role: "assistant",
    parts: [],
    status: null,
    state: "running",
    error: null,
  }
  edit(draftId, (c) => ({ ...c, messages: [...c.messages, message] }))

  const controller = new AbortController()
  running.set(draftId, controller)
  const update = (recipe: (m: AssistantMessage) => AssistantMessage) =>
    editMessage(draftId, id, recipe)

  try {
    for await (const event of streamAssistant(request, controller.signal)) {
      switch (event.type) {
        case "status":
          update((m) => ({ ...m, status: event.text || null }))
          break
        case "thinking":
          update((m) => {
            const parts = [...m.parts]
            const last = parts[parts.length - 1]
            if (last?.type === "thinking" && last.endedAt === null)
              parts[parts.length - 1] = {
                ...last,
                text: last.text + event.delta,
              }
            else
              parts.push({
                type: "thinking",
                text: event.delta,
                startedAt: Date.now(),
                endedAt: null,
              })
            return { ...m, parts }
          })
          break
        case "text":
          update((m) => {
            const parts = endThinking(m.parts)
            const last = parts[parts.length - 1]
            if (last?.type === "text")
              parts[parts.length - 1] = {
                ...last,
                text: last.text + event.delta,
              }
            else parts.push({ type: "text", text: event.delta })
            return { ...m, parts }
          })
          break
        case "proposal":
          update((m) => ({
            ...m,
            parts: [
              ...endThinking(m.parts),
              { type: "proposal", proposal: event.proposal, state: "open" },
            ],
          }))
          break
        case "done":
          update((m) => ({ ...m, state: "done", status: null }))
          break
        case "error":
          update((m) => ({
            ...m,
            state: "error",
            status: null,
            error: event.message,
          }))
          break
      }
    }
  } catch (error) {
    if (controller.signal.aborted) {
      update((m) => ({ ...m, state: "stopped", status: null }))
    } else {
      update((m) => ({
        ...m,
        state: "error",
        status: null,
        error:
          (error as Error).message || "The assistant could not be reached.",
      }))
    }
  } finally {
    if (running.get(draftId) === controller) running.delete(draftId)
    update((m) => ({ ...m, parts: endThinking(m.parts) }))
  }
}

/** Close a reasoning block once the answer (or a card) starts, or the turn ends. */
function endThinking(parts: AssistantPart[]): AssistantPart[] {
  const last = parts[parts.length - 1]
  if (last?.type !== "thinking" || last.endedAt !== null) return [...parts]
  return [...parts.slice(0, -1), { ...last, endedAt: Date.now() }]
}

/** Per-viewer preference, kept in this browser. */
export const useAssistantSettings = create<{
  showReasoning: boolean
  setShowReasoning: (on: boolean) => void
}>()(
  persist(
    (set) => ({
      showReasoning: false,
      setShowReasoning: (showReasoning) => set({ showReasoning }),
    }),
    { name: "tb-assistant-settings", storage: localJsonStorage() }
  )
)

/** Send a user message (and the form as it is now). */
export function send(
  draftId: string,
  text: string,
  step: WizardStep | "build"
) {
  const content = text.trim()
  if (!content) return
  edit(draftId, (c) => ({
    ...c,
    messages: [
      ...c.messages,
      { id: newMessageId(), role: "user", text: content },
    ],
  }))
  void run(draftId, step)
}

/** Ask again after an error: the failed answer is replaced. */
export function retry(draftId: string, step: WizardStep | "build") {
  const conversation = useAssistantStore.getState().conversations[draftId]
  const last = conversation?.messages[conversation.messages.length - 1]
  if (!last || last.role !== "assistant" || last.state !== "error") return
  edit(draftId, (c) => ({ ...c, messages: c.messages.slice(0, -1) }))
  void run(draftId, step)
}

/** "Explain the build error": attach the build and ask. */
export function explainBuild(draftId: string, build: BuildContext | null) {
  edit(draftId, (c) => ({ ...c, build }))
  send(draftId, "Explain the build error", "build")
}

/** The wizard opened from a failed build's "Ask the assistant". */
export const requestExplain = (draftId: string) =>
  useAssistantStore.setState({ explainPending: draftId })

/** Take the pending request for this draft, once. */
export function takeExplain(draftId: string): boolean {
  if (useAssistantStore.getState().explainPending !== draftId) return false
  useAssistantStore.setState({ explainPending: null })
  return true
}

/**
 * Whether the assistant is available, and the dev-only mock.
 *
 * The mock streams canned conversations (paper replication, a reads-only
 * paper, a build error) instead of calling POST /api/assistant, so the panel
 * can be worked on without the model. Turn it on in a dev server with
 * VITE_ASSISTANT_MOCK=1, or open any page with ?assistantMock (and
 * ?assistantMock=0 to turn it off again; it is kept for the tab). Production
 * builds drop it: import.meta.env.DEV is false there.
 */
import { useQuery } from "@tanstack/react-query"

import { configQuery } from "../api"
import { readSession, writeSession } from "./storage"

const MOCK_KEY = "tb.assistant.mock"

function readMockFlag(): boolean {
  if (!import.meta.env.DEV) return false
  if (import.meta.env.VITE_ASSISTANT_MOCK === "1") return true
  // Read at load: the wizard clears its query string once it has used it.
  const params = new URLSearchParams(window.location.search)
  if (params.has("assistantMock"))
    writeSession(MOCK_KEY, params.get("assistantMock") === "0" ? "0" : "1")
  return readSession(MOCK_KEY) === "1"
}

export const ASSISTANT_MOCK = readMockFlag()

export interface AssistantConfig {
  /** The server has an assistant (the toggle and panel exist). */
  enabled: boolean
  /** Model name for the privacy line, e.g. "qwen3:8b". */
  model: string | null
}

export function useAssistantConfig(): AssistantConfig {
  const config = useQuery(configQuery)
  const model = config.data?.assistant_model ?? null
  if (import.meta.env.DEV && ASSISTANT_MOCK)
    return { enabled: true, model: model ?? "qwen3:8b, mock" }
  return { enabled: config.data?.assistant === true, model }
}

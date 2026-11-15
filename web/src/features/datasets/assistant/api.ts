/**
 * Client for POST /api/assistant: a server-sent event stream read with
 * fetch (EventSource cannot POST). See ./types.ts for the events.
 */
import { BUILDER_API_URL } from "@/lib/config"

import { ApiError } from "../api"
import { ASSISTANT_MOCK } from "./config"
import type { AssistantEvent, AssistantRequest, Proposal } from "./types"

/* -------------------------------------------------------------- SSE -- */

interface RawEvent {
  event: string
  data: string
}

/**
 * Incremental text/event-stream parser (WHATWG rules): feed it chunks as they
 * arrive, in any split, and it returns the events completed so far. Handles
 * CRLF, LF and CR line ends, multi-line `data:`, comments and a line end
 * split across chunks.
 */
export class SseParser {
  private buffer = ""
  private event = ""
  private data: string[] = []

  push(chunk: string): RawEvent[] {
    this.buffer += chunk
    const events: RawEvent[] = []
    let start = 0
    for (let i = 0; i < this.buffer.length; i++) {
      const ch = this.buffer[i]
      if (ch !== "\n" && ch !== "\r") continue
      // A CR at the end of the buffer may be the first half of a CRLF.
      if (ch === "\r" && i === this.buffer.length - 1) break
      const line = this.buffer.slice(start, i)
      if (ch === "\r" && this.buffer[i + 1] === "\n") i++
      start = i + 1
      const done = this.line(line)
      if (done) events.push(done)
    }
    this.buffer = this.buffer.slice(start)
    return events
  }

  /**
   * The stream ended: a held CR ends its line, and an event whose blank
   * line never came is still delivered (lenient; the spec drops it).
   */
  end(): RawEvent[] {
    const events = this.push("\n")
    const last = this.line("")
    this.buffer = ""
    return last ? [...events, last] : events
  }

  private line(line: string): RawEvent | null {
    if (line === "") {
      if (!this.data.length) {
        this.event = ""
        return null
      }
      const raw = { event: this.event || "message", data: this.data.join("\n") }
      this.event = ""
      this.data = []
      return raw
    }
    if (line.startsWith(":")) return null
    const colon = line.indexOf(":")
    const field = colon < 0 ? line : line.slice(0, colon)
    let value = colon < 0 ? "" : line.slice(colon + 1)
    if (value.startsWith(" ")) value = value.slice(1)
    if (field === "event") this.event = value
    else if (field === "data") this.data.push(value)
    return null
  }
}

/** A raw event as an AssistantEvent; null for events the panel does not know. */
export function toAssistantEvent(raw: RawEvent): AssistantEvent | null {
  let body: unknown = {}
  if (raw.data) {
    try {
      body = JSON.parse(raw.data)
    } catch {
      // A plain-text data line: prose for text, a message for error.
      body =
        raw.event === "error"
          ? { message: raw.data }
          : { delta: raw.data, text: raw.data }
    }
  }
  const data = (body ?? {}) as Record<string, unknown>
  // Unnamed events may carry their type in the payload.
  const type = raw.event === "message" ? data.type : raw.event
  switch (type) {
    case "status":
      return { type: "status", text: String(data.text ?? "") }
    case "thinking":
      return { type: "thinking", delta: String(data.delta ?? "") }
    case "text":
      return { type: "text", delta: String(data.delta ?? "") }
    case "proposal":
      return {
        type: "proposal",
        proposal: ("proposal" in data ? data.proposal : data) as Proposal,
      }
    case "done":
      return { type: "done" }
    case "error":
      return {
        type: "error",
        message: String(data.message ?? "The assistant stopped with an error."),
      }
    default:
      return null
  }
}

/* ----------------------------------------------------------- stream -- */

/**
 * Send the conversation and yield the answer's events as they arrive.
 * Aborting the signal (Stop) ends the stream with an AbortError.
 */
export async function* streamAssistant(
  request: AssistantRequest,
  signal: AbortSignal
): AsyncGenerator<AssistantEvent> {
  if (import.meta.env.DEV && ASSISTANT_MOCK) {
    const { mockStream } = await import("./mock")
    yield* mockStream(request, signal)
    return
  }

  const response = await fetch(`${BUILDER_API_URL}/assistant`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify(request),
    signal,
  })
  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => "")
    let message = text || `The assistant did not answer (${response.status}).`
    try {
      const body = JSON.parse(text)
      if (typeof body?.detail === "string") message = body.detail
    } catch {
      /* plain text */
    }
    throw new ApiError(message, response.status)
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  const parser = new SseParser()
  try {
    for (;;) {
      const { value, done } = await reader.read()
      for (const raw of done ? parser.end() : parser.push(value)) {
        const event = toAssistantEvent(raw)
        if (!event) continue
        yield event
        if (event.type === "done" || event.type === "error") return
      }
      if (done) break
    }
  } finally {
    reader.cancel().catch(() => {})
  }
  throw new Error("The connection closed before the answer was finished.")
}

/**
 * The little markdown the assistant writes: paragraphs, numbered and bulleted
 * lists, `code` and **bold**. Rendered as React elements, so no HTML in the
 * text is ever interpreted.
 */
import type { ReactNode } from "react"

type Block =
  | { type: "p"; lines: string[] }
  | { type: "ul" | "ol"; items: string[]; start: number }

const BULLET = /^\s*[-*•]\s+(.*)$/
const NUMBERED = /^\s*(\d+)[.)]\s+(.*)$/

function blocks(text: string): Block[] {
  const out: Block[] = []
  // Asserted, not annotated: TS would otherwise narrow it to null, not seeing
  // that flush() (a closure) and the branches below reassign it.
  let current = null as Block | null
  const flush = () => {
    if (current) out.push(current)
    current = null
  }
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) {
      flush()
      continue
    }
    // Models write headings despite being asked not to: show them as a bold line.
    const heading = /^\s*#{1,6}\s+(.*)$/.exec(line)
    if (heading) {
      flush()
      out.push({ type: "p", lines: [`**${heading[1].replace(/\*\*/g, "")}**`] })
      continue
    }
    const bullet = BULLET.exec(line)
    const numbered = NUMBERED.exec(line)
    if (bullet || numbered) {
      const type = bullet ? "ul" : "ol"
      const item = bullet ? bullet[1] : numbered![2]
      if (current?.type !== type) {
        flush()
        current = {
          type,
          items: [],
          start: numbered ? Number(numbered[1]) : 1,
        }
      }
      current.items.push(item)
    } else if (current && current.type !== "p" && /^\s{2,}/.test(line)) {
      // Continuation of a list item.
      current.items[current.items.length - 1] += ` ${line.trim()}`
    } else {
      if (current?.type !== "p") {
        flush()
        current = { type: "p", lines: [] }
      }
      current.lines.push(line.trim())
    }
  }
  flush()
  return out
}

/** `code` and **bold**; an unclosed marker (mid-stream) is shown as typed. */
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = []
  const pattern = /`([^`]+)`|\*\*([^*]+)\*\*/g
  let last = 0
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text))) {
    if (match.index > last) out.push(text.slice(last, match.index))
    out.push(
      match[1] !== undefined ? (
        <code
          key={match.index}
          className="rounded-[3px] bg-muted px-1 font-mono text-t11 break-all"
        >
          {match[1]}
        </code>
      ) : (
        <strong key={match.index} className="font-semibold">
          {match[2]}
        </strong>
      )
    )
    last = pattern.lastIndex
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

export function Markdown({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-1.5 text-pretty">
      {blocks(text).map((block, i) =>
        block.type === "p" ? (
          <p key={i}>{inline(block.lines.join(" "))}</p>
        ) : block.type === "ul" ? (
          <ul key={i} className="flex list-disc flex-col gap-0.5 pl-4">
            {block.items.map((item, j) => (
              <li key={j}>{inline(item)}</li>
            ))}
          </ul>
        ) : (
          <ol
            key={i}
            start={block.start}
            className="flex list-decimal flex-col gap-0.5 pl-4"
          >
            {block.items.map((item, j) => (
              <li key={j}>{inline(item)}</li>
            ))}
          </ol>
        )
      )}
    </div>
  )
}

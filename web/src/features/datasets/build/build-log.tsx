import { ChevronDownIcon } from "lucide-react"
import { useId, useLayoutEffect, useRef, useState } from "react"

import { cn } from "@/lib/utils"

import type { Build } from "../types"

/** Within this many pixels of the bottom counts as following the tail. */
const BOTTOM_SLACK = 8

/**
 * The tail of the build log. While the build runs it scrolls with new lines,
 * unless the reader has scrolled up; scrolling back down resumes following.
 */
export function BuildLog({ log, live }: { log: Build["log"]; live: boolean }) {
  const [open, setOpen] = useState(true)
  const [following, setFollowing] = useState(true)
  const scroller = useRef<HTMLDivElement>(null)
  const id = useId()

  useLayoutEffect(() => {
    const el = scroller.current
    if (el && open && following) el.scrollTop = el.scrollHeight
  }, [log, open, following])

  const onScroll = () => {
    const el = scroller.current
    if (!el) return
    setFollowing(
      el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_SLACK
    )
  }

  return (
    <section className="overflow-hidden rounded-xl border bg-card">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
        className="flex h-(--c28) w-full items-center gap-1.5 px-2.5 text-left hover:bg-accent"
      >
        <ChevronDownIcon
          className={cn(
            "size-3.5 text-muted-foreground transition-transform",
            !open && "-rotate-90"
          )}
        />
        <span className="caption">Log</span>
        {live && open && following && (
          <span className="ml-auto text-t11 text-muted-foreground">
            Following
          </span>
        )}
      </button>
      {open && (
        <div
          id={id}
          ref={scroller}
          onScroll={onScroll}
          role="log"
          aria-live={live ? "polite" : "off"}
          tabIndex={0}
          className="max-h-[150px] overflow-auto border-t px-2.5 py-1.5 font-mono text-t11 leading-[1.5] outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
        >
          {log.length === 0 && (
            <div className="text-muted-foreground">No output yet.</div>
          )}
          {log.map((line, index) => (
            <div
              key={index}
              className={cn(
                "break-all whitespace-pre-wrap",
                line.error ? "text-destructive" : "text-muted-foreground"
              )}
            >
              {line.t}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

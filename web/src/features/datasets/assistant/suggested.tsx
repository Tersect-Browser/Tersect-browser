/**
 * How assistant suggestions look in the form: a dashed --ring border on a
 * 60% --accent tint with a SUGGESTED badge on --primary, the source, and
 * Accept / Dismiss. Nothing in them is part of the form until accepted.
 */
import { CheckIcon, FileTextIcon, XIcon } from "lucide-react"
import { useEffect, useRef } from "react"
import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/** A block applied this long ago (or less) scrolls into view on mount. */
const FRESH_MS = 4000

export function SuggestedBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-4 shrink-0 items-center rounded-[3px] bg-primary px-1 text-t9 font-semibold tracking-[0.06em] text-primary-foreground uppercase",
        className
      )}
    >
      Suggested
    </span>
  )
}

/** Dashed, tinted container for a suggestion. */
export const suggestedSurface =
  "rounded-md border border-dashed border-ring bg-accent/60"

/** "From the assistant. Source: Table S1. Not used until you accept it." */
export function SourceLine({
  source,
  lead = "From the assistant.",
  tail = "Not used until you accept it.",
}: {
  source: string
  lead?: ReactNode
  tail?: ReactNode
}) {
  return (
    <p className="flex items-start gap-1.5 text-t11 text-muted-foreground">
      <FileTextIcon className="mt-px size-3 shrink-0" />
      <span className="min-w-0">
        {lead} Source: <span className="text-foreground">{source}</span>
        {/[.!?]$/.test(source) ? "" : "."} {tail}
      </span>
    </p>
  )
}

export function SuggestedBlock({
  title,
  source,
  appliedAt,
  note,
  acceptLabel = "Accept",
  acceptDisabled,
  onAccept,
  onDismiss,
  children,
  className,
}: {
  title: ReactNode
  source: string
  appliedAt: number
  /** Replaces "From the assistant." before the source. */
  note?: ReactNode
  acceptLabel?: string
  acceptDisabled?: boolean
  onAccept: () => void
  onDismiss: () => void
  children?: ReactNode
  className?: string
}) {
  const ref = useFreshScroll<HTMLElement>(appliedAt)
  return (
    <section
      ref={ref}
      aria-label="Suggested by the assistant"
      className={cn(
        suggestedSurface,
        "flex scroll-mt-4 flex-col gap-2 px-2.5 py-2",
        className
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <SuggestedBadge />
        <span className="min-w-0 truncate font-semibold">{title}</span>
      </div>
      {children}
      <SourceLine source={source} lead={note} />
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          <XIcon /> Dismiss
        </Button>
        <Button size="sm" disabled={acceptDisabled} onClick={onAccept}>
          <CheckIcon /> {acceptLabel}
        </Button>
      </div>
    </section>
  )
}

/** Scroll a just-applied suggestion into view once. */
export function useFreshScroll<T extends HTMLElement>(appliedAt: number) {
  const ref = useRef<T>(null)
  useEffect(() => {
    if (Date.now() - appliedAt < FRESH_MS)
      ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }, [appliedAt])
  return ref
}

/** Label / value rows inside a block. */
export function SuggestedValues({
  rows,
}: {
  rows: { label: string; value: ReactNode; mono?: boolean }[]
}) {
  return (
    <dl className="grid grid-cols-[minmax(0,110px)_minmax(0,1fr)] gap-x-2 gap-y-0.5 rounded-sm bg-card/70 px-2 py-1.5">
      {rows.map((row) => (
        <div key={row.label} className="contents">
          <dt className="text-t11 text-muted-foreground">{row.label}</dt>
          <dd
            className={cn("min-w-0 truncate text-t11", row.mono && "font-mono")}
          >
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

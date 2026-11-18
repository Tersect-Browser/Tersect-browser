import { useState } from "react"

import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { formatPosition, parsePosition } from "@/lib/format"
import { clamp } from "@/lib/genome"
import { cn } from "@/lib/utils"

interface CoordinateInputProps {
  value: number
  onCommit: (value: number) => void
  "aria-label": string
}

/**
 * Genomic coordinate: mono, right-aligned and shown with thousands
 * separators. The typed value is committed on Enter or when focus leaves.
 */
function CoordinateInput({ value, onCommit, ...props }: CoordinateInputProps) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    if (draft !== null) {
      const parsed = parsePosition(draft)
      if (parsed !== null) {
        onCommit(parsed)
      }
      setDraft(null)
    }
  }
  return (
    <Input
      inputMode="numeric"
      className="w-[92px] shrink-0 text-right font-mono max-sm:w-[calc(50%-3px)] sm:max-lg:w-[116px] sm:pointer-coarse:w-[116px]"
      value={draft ?? formatPosition(value)}
      onChange={(event) => setDraft(event.target.value)}
      onFocus={(event) => event.target.select()}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          commit()
        } else if (event.key === "Escape") {
          setDraft(null)
        }
      }}
      {...props}
    />
  )
}

interface IntervalControlProps {
  value: [number, number]
  min: number
  max: number
  /** Called when the user settles on an interval, not on every slider move. */
  onChange: (value: [number, number]) => void
  className?: string
}

/**
 * A genomic interval as two coordinate inputs with a dual-thumb slider
 * between them. Inputs and slider stay in sync. On phones the slider takes
 * its own row above the two inputs.
 */
export function IntervalControl({
  value,
  min,
  max,
  onChange,
  className,
}: IntervalControlProps) {
  // Position of the thumbs while the slider is being dragged.
  const [dragging, setDragging] = useState<[number, number] | null>(null)
  const shown = dragging ?? value

  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-[5px] max-sm:flex-wrap max-sm:gap-1.5",
        className
      )}
    >
      <CoordinateInput
        aria-label="Interval start"
        value={shown[0]}
        onCommit={(start) => onChange([clamp(start, min, value[1]), value[1]])}
      />
      <Slider
        aria-label="Interval"
        className="min-w-16 flex-1 max-sm:order-first max-sm:h-7 max-sm:basis-full"
        min={min}
        max={max}
        value={shown}
        onValueChange={(next) => setDragging([next[0], next[1]])}
        onValueCommit={(next) => {
          setDragging(null)
          onChange([next[0], next[1]])
        }}
      />
      <CoordinateInput
        aria-label="Interval end"
        value={shown[1]}
        onCommit={(end) => onChange([value[0], clamp(end, value[0], max)])}
      />
    </div>
  )
}

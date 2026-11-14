import { useLayoutEffect, useRef, useState } from "react"

import { formatPosition, formatRange } from "@/lib/format"
import type { PlotPointerEvent, PlotTarget } from "@/lib/types"

/** Distance between the cursor and the tooltip. */
const CURSOR_OFFSET_X = 14
const CURSOR_OFFSET_Y = 16

function describe(target: PlotTarget): string[] {
  switch (target.type) {
    case "bin":
      return [
        target.accessionLabel,
        formatRange(target.startPosition, target.endPosition),
      ]
    case "accession":
      return [target.accessionLabel]
    case "position":
      return [formatPosition(target.position)]
    case "interval":
      return [formatRange(target.startPosition, target.endPosition)]
    default:
      return []
  }
}

/** Tooltip that follows the cursor over the plot, kept inside the window. */
export function PlotTooltip({ event }: { event: PlotPointerEvent | null }) {
  const ref = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ left: 0, top: 0 })

  useLayoutEffect(() => {
    const element = ref.current
    if (!event || !element) {
      return
    }
    let left = event.x + CURSOR_OFFSET_X
    let top = event.y + CURSOR_OFFSET_Y
    const xOverflow = left + element.offsetWidth - window.innerWidth
    if (xOverflow > 0) {
      left -= xOverflow
    }
    if (top + element.offsetHeight > window.innerHeight) {
      top = event.y - element.offsetHeight - CURSOR_OFFSET_Y
    }
    setPosition({ left, top })
  }, [event])

  if (!event) {
    return null
  }
  return (
    <div
      ref={ref}
      className="pointer-events-none fixed z-50 rounded-md bg-foreground px-2 py-1 font-mono text-[11px] whitespace-nowrap text-background select-none"
      style={position}
    >
      {describe(event.target).map((line) => (
        <div key={line}>{line}</div>
      ))}
    </div>
  )
}

import { useLayoutEffect, useMemo, useRef } from "react"
import type { MouseEvent as ReactMouseEvent } from "react"

import type { PlotPointerEvent, PlotTarget } from "@/lib/types"

interface Point {
  x: number
  y: number
}

export interface PlotPointerConfig {
  /** What lies under a point given in canvas (CSS pixel) coordinates. */
  getTarget: (position: Point) => PlotTarget
  /** Milliseconds the pointer must rest before a hover is reported. */
  hoverDelay: number
  dragCursor: string
  /** Called with viewport coordinates. Return false to refuse the drag. */
  onDragStart?: (start: Point, event: MouseEvent) => boolean | void
  onDrag?: (current: Point, event: MouseEvent) => void
  onClick: (event: PlotPointerEvent) => void
  onHover: (event: PlotPointerEvent) => void
  /** The pointer moved or left; any tooltip should be hidden. */
  onMove: () => void
}

/**
 * Mouse handling shared by the plot canvases: click detection, hover with a
 * delay, and dragging with the left button.
 */
export function usePlotPointer(config: PlotPointerConfig) {
  // Handlers always see the latest callbacks without being recreated.
  const configRef = useRef(config)
  useLayoutEffect(() => {
    configRef.current = config
  })

  const state = useRef({
    clickPosition: { x: 0, y: 0 },
    dragged: false,
    hoverTimer: undefined as ReturnType<typeof setTimeout> | undefined,
  })

  return useMemo(() => {
    const stopDrag = (event: ReactMouseEvent<HTMLCanvasElement>) => {
      event.currentTarget.style.cursor = "auto"
      state.current.dragged = false
      configRef.current.onMove()
    }

    return {
      onMouseDown: (event: ReactMouseEvent<HTMLCanvasElement>) => {
        const native = event.nativeEvent
        state.current.clickPosition = { x: native.offsetX, y: native.offsetY }
        if (native.buttons === 1) {
          const accepted = configRef.current.onDragStart?.(
            { x: native.clientX, y: native.clientY },
            native
          )
          state.current.dragged = accepted !== false
        }
      },

      onMouseMove: (event: ReactMouseEvent<HTMLCanvasElement>) => {
        const native = event.nativeEvent
        const current = configRef.current
        current.onMove()

        if (state.current.dragged) {
          if (native.buttons !== 1) {
            stopDrag(event)
            return
          }
          if (event.currentTarget.style.cursor !== current.dragCursor) {
            event.currentTarget.style.cursor = current.dragCursor
          }
          current.onDrag?.({ x: native.clientX, y: native.clientY }, native)
          return
        }

        const position = { x: native.offsetX, y: native.offsetY }
        const viewport = { x: native.clientX, y: native.clientY }
        const hover = () => {
          const target = configRef.current.getTarget(position)
          if (target.type !== "background") {
            configRef.current.onHover({ ...viewport, target })
          }
        }
        clearTimeout(state.current.hoverTimer)
        if (current.hoverDelay > 0) {
          state.current.hoverTimer = setTimeout(hover, current.hoverDelay)
        } else {
          hover()
        }
      },

      onMouseUp: (event: ReactMouseEvent<HTMLCanvasElement>) => {
        const native = event.nativeEvent
        const { clickPosition } = state.current
        if (
          clickPosition.x === native.offsetX &&
          clickPosition.y === native.offsetY
        ) {
          clearTimeout(state.current.hoverTimer)
          const target = configRef.current.getTarget(clickPosition)
          if (target.type !== "background") {
            configRef.current.onClick({
              x: native.clientX,
              y: native.clientY,
              target,
            })
          }
        }
        stopDrag(event)
      },

      onMouseLeave: () => {
        clearTimeout(state.current.hoverTimer)
        configRef.current.onMove()
      },
    }
  }, [])
}

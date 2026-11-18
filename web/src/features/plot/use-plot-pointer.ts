import { useLayoutEffect, useMemo, useRef } from "react"
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react"

import type { PlotPointerEvent, PlotTarget } from "@/lib/types"

interface Point {
  x: number
  y: number
}

/** Milliseconds a finger must rest before it counts as a long-press. */
const LONG_PRESS_MS = 500
/** Pixels a finger may wander and still count as a tap or long-press. */
const TOUCH_SLOP = 8
/** Browsers replay a touch as mouse events; those are ignored this long. */
const MOUSE_REPLAY_MS = 1000

/**
 * Touch state shared by the plot canvases and their container. The container
 * handles two-finger pinches and bumps `pinches` when one starts, which
 * cancels whatever single-finger gesture a canvas was following.
 */
export const touchGesture = { pinches: 0, lastTouch: 0 }

/** A range selection driven by a long-press and drag (viewport coordinates). */
export interface LongPressRange {
  /** Return false when no range can start at this point. */
  start: (start: Point) => boolean | void
  move: (current: Point) => void
  end: (current: Point) => void
}

interface TouchState {
  pointerId: number
  pinches: number
  /** Where the finger went down: viewport and canvas coordinates. */
  start: Point
  offset: Point
  moved: boolean
  long: boolean
  panning: boolean
  ranging: boolean
  timer: ReturnType<typeof setTimeout> | undefined
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
  /**
   * Touch: a one-finger drag pans. Defaults to onDragStart / onDrag; set
   * these when the mouse drag does something else (the ruler selects).
   */
  onTouchPanStart?: (start: Point) => boolean | void
  onTouchPan?: (current: Point) => void
  /** Touch: long-press, then drag, selects a range (the ruler). */
  longPressRange?: LongPressRange
  /** Mouse click, or a long-press on touch: opens the menu. */
  onClick: (event: PlotPointerEvent) => void
  /** Mouse hover, or a tap on touch: shows the tooltip. */
  onHover: (event: PlotPointerEvent) => void
  /** The pointer moved or left; any tooltip should be hidden. */
  onMove: () => void
}

/**
 * Pointer handling shared by the plot canvases. Mouse: click detection, hover
 * with a delay, and dragging with the left button. Touch and pen: drag to
 * pan, tap for the tooltip, long-press for the menu.
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
    touch: null as TouchState | null,
  })

  return useMemo(() => {
    const stopDrag = (event: ReactMouseEvent<HTMLCanvasElement>) => {
      event.currentTarget.style.cursor = "auto"
      state.current.dragged = false
      configRef.current.onMove()
    }

    /** A mouse event replayed by the browser after a touch. */
    const isReplay = () => Date.now() - touchGesture.lastTouch < MOUSE_REPLAY_MS

    const endTouch = () => {
      clearTimeout(state.current.touch?.timer)
      state.current.touch = null
    }
    /** The touch this event belongs to, unless a pinch has taken over. */
    const activeTouch = (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const touch = state.current.touch
      if (!touch || touch.pointerId !== event.pointerId) {
        return null
      }
      if (touch.pinches !== touchGesture.pinches) {
        endTouch()
        return null
      }
      return touch
    }

    return {
      onPointerDown: (event: ReactPointerEvent<HTMLCanvasElement>) => {
        if (event.pointerType === "mouse") {
          return
        }
        touchGesture.lastTouch = Date.now()
        if (state.current.touch) {
          // A second finger on the same canvas: the container pinches.
          endTouch()
          return
        }
        try {
          event.currentTarget.setPointerCapture(event.pointerId)
        } catch {
          // The pointer is already gone.
        }
        configRef.current.onMove()
        const native = event.nativeEvent
        const touch: TouchState = {
          pointerId: event.pointerId,
          pinches: touchGesture.pinches,
          start: { x: native.clientX, y: native.clientY },
          offset: { x: native.offsetX, y: native.offsetY },
          moved: false,
          long: false,
          panning: false,
          ranging: false,
          timer: undefined,
        }
        touch.timer = setTimeout(() => {
          if (
            state.current.touch !== touch ||
            touch.moved ||
            touch.pinches !== touchGesture.pinches
          ) {
            return
          }
          touch.long = true
          const current = configRef.current
          // With a range to drag out, the menu waits for the finger to lift.
          if (!current.longPressRange) {
            const target = current.getTarget(touch.offset)
            if (target.type !== "background") {
              current.onClick({ ...touch.start, target })
            }
          }
        }, LONG_PRESS_MS)
        state.current.touch = touch
      },

      onPointerMove: (event: ReactPointerEvent<HTMLCanvasElement>) => {
        if (event.pointerType === "mouse") {
          return
        }
        touchGesture.lastTouch = Date.now()
        const touch = activeTouch(event)
        if (!touch) {
          return
        }
        const current = configRef.current
        const position = { x: event.clientX, y: event.clientY }
        if (!touch.moved) {
          if (
            Math.hypot(position.x - touch.start.x, position.y - touch.start.y) <
            TOUCH_SLOP
          ) {
            return
          }
          touch.moved = true
          clearTimeout(touch.timer)
          if (!touch.long) {
            const accepted = current.onTouchPanStart
              ? current.onTouchPanStart(touch.start)
              : current.onDragStart?.(touch.start, event.nativeEvent)
            touch.panning = accepted !== false
          } else if (current.longPressRange) {
            touch.ranging = current.longPressRange.start(touch.start) !== false
          }
        }
        if (touch.panning) {
          if (current.onTouchPan) {
            current.onTouchPan(position)
          } else {
            current.onDrag?.(position, event.nativeEvent)
          }
        } else if (touch.ranging) {
          current.longPressRange?.move(position)
        }
      },

      onPointerUp: (event: ReactPointerEvent<HTMLCanvasElement>) => {
        if (event.pointerType === "mouse") {
          return
        }
        touchGesture.lastTouch = Date.now()
        const touch = activeTouch(event)
        if (!touch) {
          return
        }
        endTouch()
        const current = configRef.current
        if (touch.ranging) {
          current.longPressRange?.end({ x: event.clientX, y: event.clientY })
        } else if (!touch.moved) {
          const target = current.getTarget(touch.offset)
          if (target.type === "background") {
            return
          }
          if (!touch.long) {
            current.onHover({ ...touch.start, target })
          } else if (current.longPressRange) {
            current.onClick({ ...touch.start, target })
          }
        }
      },

      onPointerCancel: (event: ReactPointerEvent<HTMLCanvasElement>) => {
        if (event.pointerType !== "mouse") {
          endTouch()
        }
      },

      onMouseDown: (event: ReactMouseEvent<HTMLCanvasElement>) => {
        if (isReplay()) {
          return
        }
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
        if (isReplay()) {
          return
        }
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
        if (isReplay()) {
          return
        }
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
        if (isReplay()) {
          return
        }
        clearTimeout(state.current.hoverTimer)
        configRef.current.onMove()
      },
    }
  }, [])
}

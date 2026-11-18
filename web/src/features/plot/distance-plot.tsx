import { CircleAlertIcon, DatabaseIcon } from "lucide-react"
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react"
import type { PointerEvent as ReactPointerEvent } from "react"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { touchGesture, usePlotPointer } from "@/features/plot/use-plot-pointer"
import type { PlotDataStatus } from "@/hooks/use-plot-data"
import { useVizTokens } from "@/hooks/use-viz-tokens"
import { ceilTo, clamp, getAccessionLabel } from "@/lib/genome"
import type {
  AccessionDisplayStyle,
  PlotPointerEvent,
  PlotTarget,
} from "@/lib/types"
import { cn } from "@/lib/utils"
import { drawBins } from "@/plot/draw-bins"
import { drawScale } from "@/plot/draw-scale"
import { drawTree } from "@/plot/draw-tree"
import {
  AccessionTreeView,
  DistanceBinView,
  ScaleView,
  type BinHighlights,
} from "@/plot/views"
import { usePlotStore } from "@/store/plot-store"
import { useUiStore } from "@/store/ui-store"

/** Height of the ruler above the heatmap, in pixels. */
export const SCALE_BAR_SIZE = 24
/**
 * Bin width / height. Bins are twice as high as they are wide so accession
 * labels fit without making the plot too wide.
 */
const ASPECT_RATIO = 1 / 2

/** Width of the accession pane, in pixels. */
const PANE_WIDTH: Record<AccessionDisplayStyle, number> = {
  labels: 176,
  tree_linear: 340,
  tree_simple: 340,
}
/** On phones (HANDOFF-mobile 3.3) the pane gives the heatmap more room. */
const PHONE_PANE_WIDTH: Record<AccessionDisplayStyle, number> = {
  labels: 108,
  tree_linear: 190,
  tree_simple: 190,
}
const PHONE_QUERY = "(max-width: 639.98px)"
/** The pane never takes more than this share of the plot. */
const MAX_PANE_PROPORTION = 0.6
const COLOR_TRACK_WIDTH = 6
const COLOR_TRACK_GAP = 2
const LEADER_DASH = [2, 3]

const STYLE_NAMES: Record<AccessionDisplayStyle, string> = {
  labels: "Accessions",
  tree_linear: "Phenetic tree",
  tree_simple: "Phenetic tree (simplified)",
}

/** Largest row height (and label size) used to fill the plot at 100%. */
const MAX_FIT_ROW = 16

/**
 * Row height at 100% zoom: the legacy 2px for large panels, growing to fill
 * the plot (up to MAX_FIT_ROW) when there are few accessions, so a handful of
 * rows is readable without zooming.
 */
function baseRowHeight(rows: number, plotHeight: number) {
  if (rows <= 0 || plotHeight <= 0) {
    return 1 / ASPECT_RATIO
  }
  return Math.max(
    1 / ASPECT_RATIO,
    Math.min(MAX_FIT_ROW, Math.floor(plotHeight / rows))
  )
}

/**
 * Pixel sizes of one bin at the current zoom level. Horizontally one bin is
 * one pixel at 100%, so a chromosome fits the screen; rows and labels share
 * one height. Both scale with zoom.
 */
function binGeometry(zoomLevel: number, rowHeight = 1 / ASPECT_RATIO) {
  const zoomFactor = zoomLevel / 100
  return {
    zoomFactor,
    binWidth: zoomFactor,
    binHeight: rowHeight * zoomFactor,
  }
}

function paneWidthFor(style: AccessionDisplayStyle, containerWidth: number) {
  const widths = window.matchMedia(PHONE_QUERY).matches
    ? PHONE_PANE_WIDTH
    : PANE_WIDTH
  return Math.round(
    Math.min(widths[style], containerWidth * MAX_PANE_PROPORTION)
  )
}

interface DistancePlotProps {
  status: PlotDataStatus
  onClick: (event: PlotPointerEvent) => void
  onHover: (event: PlotPointerEvent) => void
  onMove: () => void
}

/**
 * The distance plot: a genomic ruler, the accession labels or phenetic tree,
 * and the distance heatmap, drawn on three canvases that pan together.
 */
export function DistancePlot({
  status,
  onClick,
  onHover,
  onMove,
}: DistancePlotProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const scaleCanvasRef = useRef<HTMLCanvasElement>(null)
  const binCanvasRef = useRef<HTMLCanvasElement>(null)
  const treeCanvasRef = useRef<HTMLCanvasElement>(null)

  const views = useRef<{
    tree?: AccessionTreeView
    bins?: DistanceBinView
    binInputs?: unknown[]
    tokens?: unknown
  }>({})
  const dragStart = useRef({ x: 0, y: 0 })
  /** Fingers on the plot, and the pinch they make when there are two. */
  const touches = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ distance: number; steps: number } | null>(null)
  const rowBase = useRef(1 / ASPECT_RATIO)

  const accessionStyle = usePlotStore((state) => state.accessionStyle)
  const zoomLevel = usePlotStore((state) => state.zoomLevel)
  const accessionDictionary = usePlotStore((state) => state.accessionDictionary)
  const plotPosition = usePlotStore((state) => state.plotPosition)
  const distanceBins = usePlotStore((state) => state.distanceBins)
  const orderedAccessions = usePlotStore((state) => state.orderedAccessions)
  const variantMatches = usePlotStore((state) => state.variantMatches)
  const highlight = usePlotStore((state) => state.highlight)
  const reference = usePlotStore((state) => state.reference)
  const paneWidth = usePlotStore((state) => state.treeWidth)
  const selectedCount = usePlotStore((state) => state.accessions?.length ?? 0)
  const setAccessionSheetOpen = useUiStore(
    (state) => state.setAccessionSheetOpen
  )
  const tokens = useVizTokens()

  /** Heatmap cells matched by the last variant search. */
  const binHighlights = useMemo<BinHighlights | undefined>(() => {
    if (!variantMatches || !distanceBins || !orderedAccessions) {
      return undefined
    }
    const { interval, binsize } = distanceBins.query
    const rowOf = new Map(orderedAccessions.map((acc, index) => [acc, index]))
    const map: BinHighlights = new Map()
    for (const variant of variantMatches.variants) {
      const col = Math.floor((variant.pos.start - interval[0]) / binsize)
      const rows = map.get(col) ?? []
      for (const accession of variant.accessions) {
        const row = rowOf.get(accession)
        if (row !== undefined) {
          rows.push(row)
        }
      }
      map.set(col, rows)
    }
    return map
  }, [variantMatches, distanceBins, orderedAccessions])

  const redraw = useCallback(() => {
    const state = usePlotStore.getState()
    const container = containerRef.current
    const scaleCanvas = scaleCanvasRef.current
    const binCanvas = binCanvasRef.current
    const treeCanvas = treeCanvasRef.current
    if (!container || !scaleCanvas || !binCanvas || !treeCanvas) {
      return
    }
    // The pane width positions everything else, so settle it first.
    const pane = paneWidthFor(state.accessionStyle, container.offsetWidth)
    state.setTreeWidth(pane)
    const size = {
      width: container.offsetWidth - pane,
      height: container.offsetHeight - SCALE_BAR_SIZE,
    }
    if (
      !state.distanceBins ||
      !state.orderedAccessions ||
      size.width <= 0 ||
      size.height <= 0
    ) {
      return
    }

    rowBase.current = baseRowHeight(state.orderedAccessions.length, size.height)
    const current = views.current
    const themeChanged = current.tokens !== tokens
    current.tokens = tokens

    const { binWidth, binHeight } = binGeometry(
      state.zoomLevel,
      rowBase.current
    )
    const offsetY = ceilTo(state.plotPosition.y * binHeight, binHeight)

    // Labels / tree
    const treeSize = { width: pane, height: size.height }
    const treeView = (current.tree ??= new AccessionTreeView(
      state.pheneticTree,
      state.orderedAccessions,
      binHeight,
      treeSize
    ))
    treeView.colorTrackGap = COLOR_TRACK_GAP
    treeView.lineWidth = 1
    treeView.leaderDash = LEADER_DASH
    treeView.alignLabelsRight = true
    treeView.accessionDictionary = state.accessionDictionary
    treeView.accessionStyle = state.accessionStyle
    treeView.tree = state.pheneticTree
    treeView.containerSize = treeSize
    treeView.paneWidth = pane
    treeView.reference = state.reference
    treeView.textSize = binHeight
    treeView.colorTrackWidth = COLOR_TRACK_WIDTH
    treeView.orderedAccessions = state.orderedAccessions
    treeView.canvasOffsetY = offsetY
    if (themeChanged) {
      treeView.redrawRequired = true
    }
    drawTree(treeView, tokens, offsetY, treeCanvas)

    // Ruler
    const query = state.distanceBins.query
    const scaleView = new ScaleView(
      query.interval,
      query.binsize,
      binWidth,
      SCALE_BAR_SIZE,
      { width: size.width, height: SCALE_BAR_SIZE }
    )
    scaleView.plotPosition = state.plotPosition
    scaleView.markedBins = binHighlights ? [...binHighlights.keys()] : []
    drawScale(scaleView, tokens, 0, scaleCanvas)

    // Heatmap
    const binView = (current.bins ??= new DistanceBinView(
      state.distanceBins,
      state.orderedAccessions,
      binHeight
    ))
    const binInputs = [
      state.distanceBins,
      state.orderedAccessions,
      state.sequenceGaps,
      binHighlights,
      tokens,
    ]
    if (
      !current.binInputs ||
      binInputs.some((input, i) => input !== current.binInputs?.[i])
    ) {
      binView.redrawRequired = true
      current.binInputs = binInputs
    }
    binView.aspectRatio = binWidth / binHeight
    binView.binHeight = binHeight
    binView.containerSize = size
    binView.orderedAccessions = state.orderedAccessions
    binView.plotPosition = state.plotPosition
    binView.sequenceGaps = state.sequenceGaps
    binView.distanceBins = state.distanceBins
    binView.highlights = binHighlights
    drawBins(binView, tokens, 0, 0, binCanvas)
  }, [binHighlights, tokens])

  // Layout effect: the canvases must be drawn before the browser paints the
  // pane at its new width.
  useLayoutEffect(() => {
    redraw()
  }, [
    redraw,
    accessionStyle,
    zoomLevel,
    accessionDictionary,
    plotPosition,
    distanceBins,
    orderedAccessions,
    reference,
    paneWidth,
  ])

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }
    const observer = new ResizeObserver(() => redraw())
    observer.observe(container)
    return () => observer.disconnect()
  }, [redraw])

  /* ------------------------------------------------------------ heatmap -- */

  const getBinTarget = useCallback((position: { x: number; y: number }) => {
    const state = usePlotStore.getState()
    const binView = views.current.bins
    if (!state.orderedAccessions || !state.distanceBins || !binView) {
      return { type: "background" } satisfies PlotTarget
    }
    const { binWidth, binHeight } = binGeometry(
      state.zoomLevel,
      rowBase.current
    )
    const binIndex = Math.floor(position.x / binWidth) - state.plotPosition.x
    const accessionIndex =
      Math.floor(position.y / binHeight) - state.plotPosition.y
    if (
      binIndex < 0 ||
      accessionIndex < 0 ||
      binIndex >= binView.colNum ||
      accessionIndex >= binView.rowNum
    ) {
      return { type: "background" } satisfies PlotTarget
    }
    const { interval, binsize } = state.distanceBins.query
    const accession = state.orderedAccessions[accessionIndex]
    return {
      type: "bin",
      accession,
      accessionLabel: getAccessionLabel(state.accessionDictionary, accession),
      startPosition: interval[0] + binIndex * binsize,
      endPosition: interval[0] + (binIndex + 1) * binsize - 1,
    } satisfies PlotTarget
  }, [])

  const binPointer = usePlotPointer({
    getTarget: getBinTarget,
    hoverDelay: 200,
    dragCursor: "move",
    onDragStart: (start) => {
      const state = usePlotStore.getState()
      const { binWidth, binHeight } = binGeometry(
        state.zoomLevel,
        rowBase.current
      )
      // Dragging is 'rounded' to accession / bin indices.
      dragStart.current = {
        x: start.x / binWidth - state.plotPosition.x,
        y: start.y / binHeight - state.plotPosition.y,
      }
    },
    onDrag: (position) => {
      const state = usePlotStore.getState()
      const binView = views.current.bins
      if (!binView) {
        return
      }
      const { binWidth, binHeight } = binGeometry(
        state.zoomLevel,
        rowBase.current
      )
      state.setPlotPosition({
        x: clamp(
          Math.round(position.x / binWidth - dragStart.current.x),
          1 - binView.colNum,
          0
        ),
        y: clamp(
          Math.round(position.y / binHeight - dragStart.current.y),
          1 - binView.rowNum,
          0
        ),
      })
    },
    onClick,
    onHover,
    onMove,
  })

  /* --------------------------------------------------------------- tree -- */

  const treePointer = usePlotPointer({
    getTarget: (position) => {
      const state = usePlotStore.getState()
      if (!state.orderedAccessions) {
        return { type: "background" }
      }
      const { binHeight } = binGeometry(state.zoomLevel, rowBase.current)
      const accessionIndex =
        Math.floor(position.y / binHeight) - state.plotPosition.y
      const accession = state.orderedAccessions[accessionIndex]
      if (accessionIndex < 0 || accession === undefined) {
        return { type: "background" }
      }
      return {
        type: "accession",
        accession,
        accessionLabel: getAccessionLabel(state.accessionDictionary, accession),
      }
    },
    hoverDelay: 200,
    dragCursor: "move",
    onDragStart: (start) => {
      const state = usePlotStore.getState()
      const { binHeight } = binGeometry(state.zoomLevel, rowBase.current)
      dragStart.current = {
        x: 0,
        y: start.y / binHeight - state.plotPosition.y,
      }
    },
    onDrag: (position) => {
      // Only vertical dragging, rounded to accession indices.
      const state = usePlotStore.getState()
      const { binHeight } = binGeometry(state.zoomLevel, rowBase.current)
      const rowNum = state.orderedAccessions?.length ?? 1
      state.setPlotPosition({
        x: state.plotPosition.x,
        y: clamp(
          Math.round(position.y / binHeight - dragStart.current.y),
          1 - rowNum,
          0
        ),
      })
    },
    onClick,
    onHover,
    onMove,
  })

  /* -------------------------------------------------------------- ruler -- */

  /** Genomic position under a point on the ruler (canvas x coordinate). */
  const getScaleTarget = useCallback((position: { x: number }) => {
    const state = usePlotStore.getState()
    if (!state.distanceBins) {
      return { type: "background" } satisfies PlotTarget
    }
    const { interval, binsize } = state.distanceBins.query
    const { zoomFactor } = binGeometry(state.zoomLevel, rowBase.current)
    const bpPerPixel = binsize / zoomFactor
    const bpPosition =
      position.x * bpPerPixel + interval[0] - state.plotPosition.x * binsize
    if (bpPosition < interval[0] || bpPosition > interval[1]) {
      return { type: "background" } satisfies PlotTarget
    }
    return {
      type: "position",
      position: Math.round(bpPosition),
    } satisfies PlotTarget
  }, [])

  const callbacks = useRef({ onClick, onHover })
  useLayoutEffect(() => {
    callbacks.current = { onClick, onHover }
  })

  /**
   * A region selection along the ruler, from a viewport x coordinate. It may
   * extend past the edges of the ruler.
   */
  const startRangeSelection = (startX: number) => {
    const canvas = scaleCanvasRef.current
    const query = usePlotStore.getState().distanceBins?.query
    if (!canvas || !query) {
      return null
    }
    const toCanvasX = (clientX: number) =>
      clientX - canvas.getBoundingClientRect().left
    if (getScaleTarget({ x: toCanvasX(startX) }).type === "background") {
      return null
    }
    const positionAt = (clientX: number, fallback: number) => {
      const target = getScaleTarget({ x: toCanvasX(clientX) })
      return target.type === "position" ? target.position : fallback
    }
    return {
      move: (point: { x: number; y: number }) => {
        const left = Math.min(startX, point.x)
        const right = Math.max(startX, point.x)
        const selection = {
          start: positionAt(left, query.interval[0]),
          end: positionAt(right, query.interval[1]),
        }
        usePlotStore.getState().setHighlight(selection)
        callbacks.current.onHover({
          ...point,
          target: {
            type: "interval",
            startPosition: selection.start,
            endPosition: selection.end,
          },
        })
      },
      end: (point: { x: number; y: number }) => {
        const selection = usePlotStore.getState().highlight
        if (selection) {
          callbacks.current.onClick({
            ...point,
            target: {
              type: "interval",
              startPosition: selection.start,
              endPosition: selection.end,
            },
          })
        }
      },
    }
  }
  const touchRange = useRef<ReturnType<typeof startRangeSelection>>(null)

  const scalePointer = usePlotPointer({
    getTarget: getScaleTarget,
    hoverDelay: 0,
    dragCursor: "col-resize",
    onDragStart: (start) => {
      // Dragging along the ruler selects a region. It is tracked on the
      // window so the selection can extend past the edges of the ruler.
      const range = startRangeSelection(start.x)
      if (!range) {
        return false
      }
      const onWindowMove = (event: MouseEvent) =>
        range.move({ x: event.clientX, y: event.clientY })
      const onWindowUp = (event: MouseEvent) => {
        window.removeEventListener("mousemove", onWindowMove)
        window.removeEventListener("mouseup", onWindowUp)
        range.end({ x: event.clientX, y: event.clientY })
      }
      window.addEventListener("mousemove", onWindowMove)
      window.addEventListener("mouseup", onWindowUp)
      // The window listeners take over from here.
      return false
    },
    // Touch: a drag along the ruler pans sideways; long-press, then drag,
    // selects a region.
    onTouchPanStart: (start) => {
      const state = usePlotStore.getState()
      const { binWidth } = binGeometry(state.zoomLevel, rowBase.current)
      dragStart.current = {
        x: start.x / binWidth - state.plotPosition.x,
        y: 0,
      }
    },
    onTouchPan: (position) => {
      const state = usePlotStore.getState()
      const binView = views.current.bins
      if (!binView) {
        return
      }
      const { binWidth } = binGeometry(state.zoomLevel, rowBase.current)
      state.setPlotPosition({
        x: clamp(
          Math.round(position.x / binWidth - dragStart.current.x),
          1 - binView.colNum,
          0
        ),
        y: state.plotPosition.y,
      })
    },
    longPressRange: {
      start: (start) => {
        touchRange.current = startRangeSelection(start.x)
        return touchRange.current !== null
      },
      move: (point) => touchRange.current?.move(point),
      end: (point) => {
        touchRange.current?.end(point)
        touchRange.current = null
      },
    },
    onClick,
    onHover,
    onMove,
  })

  /* -------------------------------------------------------------- pinch -- */

  /**
   * One zoom step that keeps the bin under a point (relative to the heatmap)
   * where it is.
   */
  const zoomAround = (direction: 1 | -1, centre: { x: number; y: number }) => {
    const before = usePlotStore.getState()
    const from = binGeometry(before.zoomLevel, rowBase.current)
    if (direction > 0) {
      before.zoomIn()
    } else {
      before.zoomOut()
    }
    const after = usePlotStore.getState()
    const binView = views.current.bins
    if (after.zoomLevel === before.zoomLevel || !binView) {
      return
    }
    const to = binGeometry(after.zoomLevel, rowBase.current)
    const x = Math.max(0, centre.x)
    const y = Math.max(0, centre.y)
    after.setPlotPosition({
      x: clamp(
        Math.round(
          x / to.binWidth - (x / from.binWidth - before.plotPosition.x)
        ),
        1 - binView.colNum,
        0
      ),
      y: clamp(
        Math.round(
          y / to.binHeight - (y / from.binHeight - before.plotPosition.y)
        ),
        1 - binView.rowNum,
        0
      ),
    })
  }

  const pinchDistance = () => {
    const [a, b] = [...touches.current.values()]
    return Math.hypot(a.x - b.x, a.y - b.y) || 1
  }

  const onTouchDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse") {
      return
    }
    touches.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (touches.current.size === 2) {
      // Takes over from whatever the canvases were following.
      touchGesture.pinches += 1
      pinch.current = { distance: pinchDistance(), steps: 0 }
      onMove()
    }
  }

  const onTouchMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!touches.current.has(event.pointerId)) {
      return
    }
    touches.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const container = containerRef.current
    if (!pinch.current || touches.current.size !== 2 || !container) {
      return
    }
    // Zoom moves in the toolbar's steps (×1.3 each).
    const steps = Math.round(
      Math.log(pinchDistance() / pinch.current.distance) / Math.log(1.3)
    )
    if (steps === pinch.current.steps) {
      return
    }
    const [a, b] = [...touches.current.values()]
    const bounds = container.getBoundingClientRect()
    const centre = {
      x: (a.x + b.x) / 2 - bounds.left - usePlotStore.getState().treeWidth,
      y: (a.y + b.y) / 2 - bounds.top - SCALE_BAR_SIZE,
    }
    const direction = steps > pinch.current.steps ? 1 : -1
    while (pinch.current.steps !== steps) {
      zoomAround(direction, centre)
      pinch.current.steps += direction
    }
  }

  const onTouchEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    touches.current.delete(event.pointerId)
    if (touches.current.size < 2) {
      pinch.current = null
    }
  }

  /* ------------------------------------------------------------- render -- */

  const selection = useMemo(() => {
    if (!highlight || !distanceBins) {
      return null
    }
    const { interval, binsize } = distanceBins.query
    // Horizontal only, so the row height does not matter here.
    const { zoomFactor, binWidth } = binGeometry(zoomLevel)
    const bpPerPixel = binsize / zoomFactor
    return {
      left:
        (highlight.start - interval[0]) / bpPerPixel +
        plotPosition.x * binWidth,
      width: (highlight.end - highlight.start + 1) / bpPerPixel,
    }
  }, [highlight, distanceBins, zoomLevel, plotPosition.x])

  const isEmpty = selectedCount === 0
  const hasErrors = !isEmpty && status.errors.length > 0
  const isLoading = !isEmpty && !hasErrors && status.loadMessage !== ""
  const progress = /(\d+)%/.exec(status.loadMessage)?.[1]

  return (
    <div
      ref={containerRef}
      // touch-none: the plot handles drags and pinches itself, so the page
      // neither scrolls nor zooms under it.
      className="relative h-full w-full touch-none overflow-hidden bg-background select-none [-webkit-touch-callout:none]"
      onPointerDown={onTouchDown}
      onPointerMove={onTouchMove}
      onPointerUp={onTouchEnd}
      onPointerCancel={onTouchEnd}
      onContextMenu={(event) => {
        // A long-press opens our menu, not the browser's.
        if (Date.now() - touchGesture.lastTouch < 1000) {
          event.preventDefault()
        }
      }}
      onWheel={(event) => {
        const state = usePlotStore.getState()
        if (event.deltaY > 0) {
          state.zoomOut()
        } else {
          state.zoomIn()
        }
      }}
      onMouseLeave={onMove}
    >
      {/* Corner */}
      <div
        className="absolute top-0 left-0 flex items-center gap-1.5 border-r border-b bg-card px-2.5 text-t11 text-muted-foreground"
        style={{ width: paneWidth, height: SCALE_BAR_SIZE }}
      >
        <span className="truncate font-semibold text-foreground">
          {STYLE_NAMES[accessionStyle]}
        </span>
        <span className="font-mono max-sm:hidden">
          {orderedAccessions?.length ?? selectedCount}
        </span>
      </div>

      {/* Ruler */}
      <div
        className="absolute top-0 right-0 border-b"
        style={{ left: paneWidth, height: SCALE_BAR_SIZE }}
      >
        <canvas
          ref={scaleCanvasRef}
          className="block"
          style={{ height: SCALE_BAR_SIZE }}
          {...scalePointer}
        />
      </div>

      {/* Accession pane */}
      <div
        className="absolute bottom-0 left-0 overflow-hidden border-r bg-card"
        style={{ top: SCALE_BAR_SIZE, width: paneWidth }}
      >
        <canvas ref={treeCanvasRef} className="block" {...treePointer} />
      </div>

      {/* Heatmap */}
      <div
        className="absolute right-0 bottom-0 overflow-hidden"
        style={{ top: SCALE_BAR_SIZE, left: paneWidth }}
      >
        <canvas
          ref={binCanvasRef}
          className="absolute top-0 left-0 [image-rendering:pixelated]"
          {...binPointer}
        />
      </div>

      {/* Ruler selection, down the full height of the plot */}
      {selection && (
        <div
          className="pointer-events-none absolute inset-y-0 right-0 overflow-hidden"
          style={{ left: paneWidth }}
        >
          <div
            className="absolute inset-y-0 border-x-[1.5px] border-(--viz-selection) bg-[color-mix(in_srgb,var(--viz-selection)_18%,transparent)]"
            style={{ left: selection.left, width: selection.width }}
          />
        </div>
      )}

      {isEmpty && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-background px-4 text-center">
          <div className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <DatabaseIcon className="size-5" />
          </div>
          <div className="text-sm font-semibold">No accessions selected</div>
          <p className="text-muted-foreground">
            Choose at least two accessions to compare against a reference.
          </p>
          <Button onClick={() => setAccessionSheetOpen(true)}>
            <DatabaseIcon />
            Select accessions
          </Button>
        </div>
      )}

      {(isLoading || hasErrors) && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-background/62 px-3"
          role="status"
          aria-live="polite"
        >
          {hasErrors ? (
            <div className="flex max-w-md items-start gap-2.5 rounded-xl border border-destructive bg-card px-4 py-3 shadow-md">
              <CircleAlertIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
              <div className="flex flex-col gap-1">
                <div className="text-sm font-semibold">
                  The plot could not be drawn
                </div>
                <div className="whitespace-pre-wrap text-muted-foreground">
                  {status.errors.join("\n")}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex w-60 max-w-full flex-col items-center gap-2.5 rounded-xl border bg-card px-4 py-3.5 shadow-md">
              <Spinner className="size-5" />
              <div className="font-mono text-t11">{status.loadMessage}</div>
              <div className="h-[3px] w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full bg-primary transition-[width]",
                    progress === undefined && "w-1/3 animate-pulse"
                  )}
                  style={
                    progress === undefined
                      ? undefined
                      : { width: `${progress}%` }
                  }
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

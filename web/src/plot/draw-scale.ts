import { formatKbp, formatMbp } from "@/lib/format"
import { ceilTo, findClosest, formatCanvasFont } from "@/lib/genome"
import type { ContainerSize } from "@/lib/types"
import type { PlotTheme } from "@/plot/theme"
import type { ScaleView } from "@/plot/views"

interface ScaleTick {
  position: number
  type: "major" | "minor"
  useLabel: boolean
  unit?: "Mbp" | "kbp"
}

const MAJOR_TICK_PROPORTION = 0.25
const MINOR_TICK_PROPORTION = 0.12
/** Label size in pixels for the on-screen ruler height (24px). */
const TEXT_SIZE_PROPORTION = 10 / 24
const SCALE_TICK_BP_DISTANCES = [
  2500, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000, 2500000,
  5000000, 10000000,
]

/** Widest label expected on the scale, used to space the major ticks. */
const MAX_WIDTH_SCALE_LABEL = "250.25 Mbp"
const MAX_WIDTH_SCALE_LABEL_MARGIN = 2

export function drawScale(
  scaleView: ScaleView,
  theme: PlotTheme,
  offsetX: number,
  targetCanvas: HTMLCanvasElement
) {
  targetCanvas.width = scaleView.containerSize
    ? scaleView.containerSize.width
    : getScaleImageSize(scaleView).width
  targetCanvas.height = scaleView.scaleBarHeight

  const ctx = targetCanvas.getContext("2d")
  if (!ctx) {
    return
  }
  ctx.clearRect(0, 0, targetCanvas.width, targetCanvas.height)

  // Correct for canvas positioning (no scale over the label column), plot
  // position (horizontal scroll) and canvas pixel positioning (0.5 offset).
  const fullOffsetX = 0.5 + offsetX + getPlotScrollOffsetX(scaleView)
  ctx.translate(fullOffsetX, 0.5)
  ctx.strokeStyle = theme.ruler
  ctx.fillStyle = theme.ruler
  ctx.lineWidth = 1
  ctx.textBaseline = "top"
  ctx.textAlign = "center"
  ctx.font = formatCanvasFont(
    scaleView.scaleBarHeight * TEXT_SIZE_PROPORTION,
    theme.monoFont
  )

  drawAllTicks(scaleView, ctx)

  // Marked bins: a 4px band along the bottom edge.
  if (scaleView.markedBins.length) {
    ctx.fillStyle = theme.variantColor
    const width = Math.max(1, scaleView.binWidth)
    for (const bin of scaleView.markedBins) {
      ctx.fillRect(
        bin * scaleView.binWidth - 0.5,
        scaleView.scaleBarHeight - 4.5,
        width,
        4
      )
    }
  }

  // Hide scale over labels
  ctx.clearRect(-fullOffsetX, 0, offsetX, targetCanvas.height)
}

/** Full-size scale image, used for export. */
export function getScaleImageData(
  scaleView: ScaleView,
  theme: PlotTheme
): ImageData {
  const canvas = document.createElement("canvas")
  drawScale(scaleView, theme, 0, canvas)
  const ctx = canvas.getContext("2d")
  if (!ctx) {
    throw new Error("Canvas is not available")
  }
  return ctx.getImageData(0, 0, canvas.width, canvas.height)
}

export function getScaleImageSize(scaleView: ScaleView): ContainerSize {
  return {
    width:
      scaleView.bpToPixelPosition(
        ceilTo(scaleView.interval[1], scaleView.binsize)
      ) + 1,
    height: scaleView.scaleBarHeight,
  }
}

function endPosition(scaleView: ScaleView): number {
  return (
    ceilTo(
      scaleView.interval[1] - scaleView.interval[0] + 1,
      scaleView.binsize
    ) + scaleView.interval[0]
  )
}

function drawAllTicks(scaleView: ScaleView, ctx: CanvasRenderingContext2D) {
  const maxLabelWidth = ctx.measureText(MAX_WIDTH_SCALE_LABEL).width
  // Ticks are spaced as close as possible to the width of the widest label.
  const tickBpDistance = findClosest(
    maxLabelWidth * MAX_WIDTH_SCALE_LABEL_MARGIN * scaleView.bpPerPixel,
    SCALE_TICK_BP_DISTANCES
  )
  // Two decimals of a megabase cannot tell ticks under 10 kbp apart.
  const unit = tickBpDistance < 10000 ? "kbp" : "Mbp"

  // Baseline
  const baselinePos = ctx.canvas.height - 1
  ctx.beginPath()
  ctx.moveTo(0, baselinePos)
  ctx.lineTo(
    scaleView.bpToPixelPosition(endPosition(scaleView)) - 1,
    baselinePos
  )
  ctx.stroke()

  // Start and end ticks
  drawScaleTick(scaleView, ctx, {
    position: scaleView.interval[0],
    type: "major",
    useLabel: false,
  })
  drawScaleTick(
    scaleView,
    ctx,
    { position: endPosition(scaleView), type: "major", useLabel: false },
    -1
  )

  drawTicks(scaleView, ctx, tickBpDistance, {
    type: "major",
    useLabel: true,
    unit,
  })
  drawTicks(scaleView, ctx, tickBpDistance / 5, {
    type: "minor",
    useLabel: false,
  })
}

function drawTicks(
  scaleView: ScaleView,
  ctx: CanvasRenderingContext2D,
  tickBpDistance: number,
  tick: Omit<ScaleTick, "position">
) {
  for (
    let position = ceilTo(scaleView.interval[0] - 1, tickBpDistance);
    position < scaleView.interval[1];
    position += tickBpDistance
  ) {
    drawScaleTick(scaleView, ctx, { ...tick, position })
  }
}

function drawScaleTick(
  scaleView: ScaleView,
  ctx: CanvasRenderingContext2D,
  tick: ScaleTick,
  offsetX = 0
) {
  const tickX = scaleView.bpToPixelPosition(tick.position) + offsetX
  const tickSize =
    scaleView.scaleBarHeight *
    (tick.type === "major" ? MAJOR_TICK_PROPORTION : MINOR_TICK_PROPORTION)

  ctx.beginPath()
  ctx.moveTo(tickX, ctx.canvas.height - 1)
  ctx.lineTo(tickX, ctx.canvas.height - tickSize - 1)
  ctx.stroke()

  if (tick.useLabel) {
    const label =
      tick.unit === "kbp" ? formatKbp(tick.position) : formatMbp(tick.position)
    let labelX = tickX
    // Shifting first label if it does not fit in the viewing area
    const halfLabelWidth = ctx.measureText(label).width / 2
    const labelOverflow =
      tickX - halfLabelWidth + getPlotScrollOffsetX(scaleView)
    if (labelOverflow < 0) {
      labelX +=
        -labelOverflow > halfLabelWidth ? halfLabelWidth : -labelOverflow
    }
    ctx.fillText(label, labelX, 2)
  }
}

function getPlotScrollOffsetX(scaleView: ScaleView): number {
  return scaleView.plotPosition.x * scaleView.binWidth
}

import { ceilTo, floorTo } from "@/lib/genome"
import type { ContainerSize, SequenceInterval } from "@/lib/types"
import { buildHeatPalette, paletteOffset, type PlotTheme } from "@/plot/theme"
import type { DistanceBinView } from "@/plot/views"

/**
 * Draw the heatmap. The image holds one pixel per bin and is scaled up to the
 * bin size with CSS, so only the visible portion is ever copied.
 */
export function drawBins(
  binView: DistanceBinView,
  theme: PlotTheme,
  offsetX: number,
  offsetY: number,
  targetCanvas: HTMLCanvasElement
) {
  if (binView.redrawRequired) {
    generatePlotArray(binView, theme)
  }
  updateCanvas(binView, targetCanvas)
  const ctx = targetCanvas.getContext("2d")
  if (!ctx) {
    return
  }
  ctx.clearRect(0, 0, targetCanvas.width, targetCanvas.height)
  const visibleImage = extractVisibleImage(
    binView,
    offsetX,
    offsetY,
    targetCanvas
  )
  if (visibleImage) {
    ctx.putImageData(visibleImage, offsetX, offsetY)
  }
}

/** Full-size heatmap image, used for export. */
export function getBinImageData(
  binView: DistanceBinView,
  theme: PlotTheme
): ImageData {
  if (binView.redrawRequired) {
    generatePlotArray(binView, theme)
  }
  const size = getBinImageSize(binView)
  const source = document.createElement("canvas")
  source.width = binView.colNum
  source.height = binView.rowNum
  source
    .getContext("2d")
    ?.putImageData(
      new ImageData(binView.imageArray, binView.colNum, binView.rowNum),
      0,
      0
    )

  const scaled = document.createElement("canvas")
  scaled.width = size.width
  scaled.height = size.height
  const ctx = scaled.getContext("2d")
  if (!ctx) {
    throw new Error("Canvas is not available")
  }
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(source, 0, 0, size.width, size.height)
  return ctx.getImageData(0, 0, size.width, size.height)
}

export function getBinImageSize(binView: DistanceBinView): ContainerSize {
  return {
    width: Math.ceil(binView.colNum * binView.binWidth),
    height: Math.ceil(binView.rowNum * binView.binHeight),
  }
}

function addPlotGap(
  binView: DistanceBinView,
  gap: SequenceInterval,
  theme: PlotTheme
) {
  const { rowNum, colNum, interval, binsize } = binView
  const startPos = Math.max(gap.start, interval[0])
  const endPos = Math.min(gap.end, interval[1])
  const binStart = ceilTo(startPos - interval[0], binsize) / binsize
  // NOTE: binEnd index is exclusive while gap.end position is inclusive
  const binEnd = Math.min(
    floorTo(endPos - interval[0] + 1, binsize) / binsize,
    colNum
  )
  for (let row = 0; row < rowNum; row++) {
    for (let col = binStart; col < binEnd; col++) {
      binView.imageArray.set(theme.gap, 4 * (col + colNum * row))
    }
  }
}

function extractVisibleImage(
  binView: DistanceBinView,
  offsetX: number,
  offsetY: number,
  targetCanvas: HTMLCanvasElement
): ImageData | null {
  const pos = binView.plotPosition
  const colNum = binView.colNum
  let visibleCols = Math.ceil(targetCanvas.width / binView.binWidth) - offsetX
  if (visibleCols > colNum + pos.x) {
    // More visible area than available columns
    visibleCols = Math.max(colNum + pos.x, 1)
  }
  const visibleRows =
    Math.ceil(targetCanvas.height / binView.binHeight) - offsetY
  if (visibleCols < 1 || visibleRows < 1) {
    return null
  }

  const visibleArray = new Uint8ClampedArray(4 * visibleRows * visibleCols)
  for (let i = 0; i < visibleRows; i++) {
    const rowStart = 4 * (colNum * (i - pos.y) - pos.x)
    if (rowStart >= binView.imageArray.length) {
      break
    }
    visibleArray.set(
      binView.imageArray.subarray(rowStart, rowStart + 4 * visibleCols),
      4 * i * visibleCols
    )
  }
  return new ImageData(visibleArray, visibleCols, visibleRows)
}

function generatePlotArray(binView: DistanceBinView, theme: PlotTheme) {
  const palette = buildHeatPalette(theme)
  const rowNum = binView.rowNum
  const colNum = binView.colNum
  // First dimension (rows) are accessions, second (cols) are bins.
  const binMatrix = binView.orderedAccessions.map(
    (accession) => binView.distanceBins.bins[accession] ?? []
  )
  const maxDistances = getMaxDistances(binMatrix, colNum)

  const image = new Uint8ClampedArray(4 * rowNum * colNum)
  for (let row = 0; row < rowNum; row++) {
    const rowOffset = colNum * row
    const rowBins = binMatrix[row]
    for (let col = 0; col < colNum; col++) {
      const distance = rowBins[col]
      // A distance that cannot be computed is drawn as the maximum.
      const offset = Number.isFinite(distance)
        ? paletteOffset(distance, maxDistances[col])
        : palette.length - 4
      const pos = 4 * (col + rowOffset)
      image[pos] = palette[offset]
      image[pos + 1] = palette[offset + 1]
      image[pos + 2] = palette[offset + 2]
      image[pos + 3] = palette[offset + 3]
    }
  }
  binView.imageArray = image

  for (const gap of binView.sequenceGaps ?? []) {
    if ((gap.size ?? gap.end - gap.start + 1) >= binView.binsize) {
      addPlotGap(binView, gap, theme)
    }
  }

  binView.highlights?.forEach((rows, col) => {
    if (col < 0 || col >= colNum) {
      return
    }
    for (const row of rows) {
      if (row >= 0 && row < rowNum) {
        image.set(theme.variant, 4 * (col + colNum * row))
      }
    }
  })

  binView.redrawRequired = false
}

/** Maximum finite distance per bin across the displayed accessions. */
function getMaxDistances(binMatrix: number[][], colNum: number): number[] {
  const maxDistances = new Array<number>(colNum).fill(0)
  for (const accessionBins of binMatrix) {
    for (let i = 0; i < colNum; i++) {
      const distance = accessionBins[i]
      if (Number.isFinite(distance) && distance > maxDistances[i]) {
        maxDistances[i] = distance
      }
    }
  }
  return maxDistances
}

function updateCanvas(
  binView: DistanceBinView,
  targetCanvas: HTMLCanvasElement
) {
  targetCanvas.style.width = `${binView.binWidth * 100}%`
  targetCanvas.style.height = `${binView.binHeight * 100}%`
  const width = binView.containerSize
    ? binView.containerSize.width
    : binView.colNum * binView.binWidth
  const height = binView.containerSize
    ? binView.containerSize.height
    : binView.rowNum * binView.binHeight
  // Assigning a canvas dimension clears it, so only do so when it changed.
  if (targetCanvas.width !== width) {
    targetCanvas.width = width
  }
  if (targetCanvas.height !== height) {
    targetCanvas.height = height
  }
}

import {
  ceilTo,
  formatCanvasFont,
  getAccessionColors,
  getAccessionLabel,
} from "@/lib/genome"
import type { ContainerSize, TreeNode } from "@/lib/types"
import type { PlotTheme } from "@/plot/theme"
import { getTreeDepth, getTreeDepthLinear } from "@/plot/tree"
import type { AccessionTreeView } from "@/plot/views"

const TREE_LEFT_MARGIN = 5
/** Space between right-aligned labels and the colour tracks. */
const LABEL_RIGHT_MARGIN = 6
/** Line metrics as proportions of the text size. */
const TREE_LINE_DASH = [0.1, 0.1]
const TREE_LINE_DASH_WIDTH = 0.1
const TREE_LINE_WIDTH = 0.1

/**
 * Draw the accession labels or tree. The image is rendered once to an
 * off-screen canvas and blitted on scroll.
 */
export function drawTree(
  treeView: AccessionTreeView,
  theme: PlotTheme,
  offsetY: number,
  targetCanvas: HTMLCanvasElement
) {
  if (treeView.redrawRequired) {
    generateTree(treeView, theme)
  }
  targetCanvas.height = treeView.containerSize.height
  targetCanvas.width = treeView.offscreenCanvas.width
  const ctx = targetCanvas.getContext("2d")
  if (!ctx || !treeView.offscreenCanvas.width) {
    return
  }
  ctx.clearRect(0, 0, targetCanvas.width, targetCanvas.height)
  ctx.drawImage(treeView.offscreenCanvas, 0, offsetY - treeView.canvasOffsetY)
}

/** Full label / tree image, used for export. */
export function getTreeImageData(
  treeView: AccessionTreeView,
  theme: PlotTheme
): ImageData {
  if (treeView.redrawRequired) {
    generateTree(treeView, theme)
  }
  const ctx = treeView.offscreenCanvas.getContext("2d")
  if (!ctx) {
    throw new Error("Canvas is not available")
  }
  return ctx.getImageData(
    0,
    0,
    treeView.offscreenCanvas.width,
    treeView.offscreenCanvas.height
  )
}

export function getTreeImageSize(
  treeView: AccessionTreeView,
  theme: PlotTheme
): ContainerSize {
  if (treeView.redrawRequired) {
    updateOffscreenCanvasWidth(treeView, theme)
  }
  return {
    width: treeView.offscreenCanvas.width,
    height: treeView.offscreenCanvas.height,
  }
}

function generateTree(treeView: AccessionTreeView, theme: PlotTheme) {
  // Resizing the canvas also clears it.
  updateOffscreenCanvasWidth(treeView, theme)
  const ctx = treeView.offscreenCanvas.getContext("2d")
  if (!ctx) {
    return
  }
  ctx.clearRect(
    0,
    0,
    treeView.offscreenCanvas.width,
    treeView.offscreenCanvas.height
  )
  ctx.font = formatCanvasFont(treeView.textSize, theme.monoFont)
  ctx.textBaseline = "top"

  if (treeView.accessionStyle === "labels" || !treeView.tree.root) {
    const right = treeView.alignLabelsRight
    ctx.textAlign = right ? "right" : "left"
    const x = right
      ? treeView.offscreenCanvas.width -
        getColorTracksWidth(treeView) -
        LABEL_RIGHT_MARGIN
      : 0
    treeView.orderedAccessions.forEach((accession, index) => {
      ctx.fillStyle = labelColor(treeView, theme, accession)
      ctx.fillText(
        getAccessionLabel(treeView.accessionDictionary, accession),
        x,
        index * treeView.textSize + treeView.canvasOffsetY
      )
    })
    ctx.textAlign = "left"
  } else {
    drawLabelTree(
      treeView.tree.root,
      TREE_LEFT_MARGIN,
      ctx,
      treeView,
      theme,
      getTreeScale(ctx, treeView, treeView.tree.root),
      { currentRow: 0 }
    )
  }
  drawColorTracks(ctx, treeView)
  treeView.redrawRequired = false
}

/** The reference accession is picked out in the ruler colour. */
function labelColor(
  treeView: AccessionTreeView,
  theme: PlotTheme,
  accession: string | undefined
): string {
  return accession !== undefined && accession === treeView.reference
    ? theme.ruler
    : theme.label
}

/** One column of blocks per group category, at the right edge of the pane. */
function drawColorTracks(
  ctx: CanvasRenderingContext2D,
  treeView: AccessionTreeView
) {
  const step = treeView.colorTrackWidth + treeView.colorTrackGap
  const left = treeView.offscreenCanvas.width - getColorTracksWidth(treeView)
  treeView.orderedAccessions.forEach((accession, rowIndex) => {
    getAccessionColors(treeView.accessionDictionary, accession).forEach(
      (color, track) => {
        if (!color) {
          return
        }
        ctx.fillStyle = color
        ctx.fillRect(
          left + treeView.colorTrackGap + track * step,
          rowIndex * treeView.textSize + treeView.canvasOffsetY,
          treeView.colorTrackWidth,
          treeView.textSize
        )
      }
    )
  })
}

function drawLabelTree(
  subtree: TreeNode,
  basePosX: number,
  ctx: CanvasRenderingContext2D,
  treeView: AccessionTreeView,
  theme: PlotTheme,
  scale: number,
  drawState: { currentRow: number }
) {
  const yoffset = treeView.canvasOffsetY
  let prevPosY = yoffset + drawState.currentRow * treeView.textSize

  if (!subtree.children.length) {
    const label = getAccessionLabel(
      treeView.accessionDictionary,
      subtree.taxon?.name ?? ""
    )
    ctx.fillStyle = labelColor(treeView, theme, subtree.taxon?.name)
    ctx.fillText(label, basePosX, prevPosY)
    drawTrailingLine(
      ctx,
      treeView,
      theme,
      basePosX + ctx.measureText(label).width + 5,
      prevPosY + treeView.textSize / 2 - 0.5
    )
    drawState.currentRow++
    return
  }

  const subtreePosX: number[] = []
  const subtreePosY: number[] = []
  for (const child of subtree.children) {
    const childPosX = getEdgeLength(child, treeView) * scale + basePosX
    drawLabelTree(child, childPosX, ctx, treeView, theme, scale, drawState)
    subtreePosX.push(childPosX)
    const curPosY = drawState.currentRow * treeView.textSize + yoffset
    subtreePosY.push((prevPosY + curPosY) / 2)
    prevPosY = curPosY
  }

  ctx.lineCap = "round"
  ctx.beginPath()
  ctx.lineWidth = treeView.lineWidth ?? TREE_LINE_WIDTH * treeView.textSize
  ctx.strokeStyle = theme.tree
  ctx.setLineDash([])
  // Vertical line (from centre of first to centre of last subtree)
  ctx.moveTo(basePosX, subtreePosY[0])
  ctx.lineTo(basePosX, subtreePosY[subtreePosY.length - 1])
  // Horizontal lines to individual subtrees
  subtreePosX.forEach((childPosX, i) => {
    ctx.moveTo(basePosX, subtreePosY[i])
    ctx.lineTo(childPosX, subtreePosY[i])
  })
  ctx.stroke()
}

/** Dashed leader line from a label to its heatmap row. */
function drawTrailingLine(
  ctx: CanvasRenderingContext2D,
  treeView: AccessionTreeView,
  theme: PlotTheme,
  xStart: number,
  yPos: number
) {
  ctx.lineCap = "butt"
  ctx.beginPath()
  ctx.lineWidth = treeView.lineWidth ?? TREE_LINE_DASH_WIDTH * treeView.textSize
  ctx.strokeStyle = theme.leader
  ctx.setLineDash(
    treeView.leaderDash ?? TREE_LINE_DASH.map((x) => x * treeView.textSize)
  )
  ctx.moveTo(xStart, yPos)
  ctx.lineTo(ctx.canvas.width - getColorTracksWidth(treeView), yPos)
  ctx.stroke()
}

function getColorTracksWidth(treeView: AccessionTreeView): number {
  let tracks = 0
  for (const entry of Object.values(treeView.accessionDictionary ?? {})) {
    tracks = Math.max(tracks, entry.colors?.length ?? 0)
  }
  return tracks * (treeView.colorTrackWidth + treeView.colorTrackGap)
}

function getEdgeLength(node: TreeNode, treeView: AccessionTreeView): number {
  return treeView.accessionStyle === "tree_simple" ? 1 : (node.length ?? 0)
}

function getMaxLabelWidth(
  ctx: CanvasRenderingContext2D,
  treeView: AccessionTreeView
): number {
  let max = 0
  for (const accession of treeView.orderedAccessions) {
    const label = getAccessionLabel(treeView.accessionDictionary, accession)
    max = Math.max(max, ctx.measureText(label).width)
  }
  return max
}

function getTreeScale(
  ctx: CanvasRenderingContext2D,
  treeView: AccessionTreeView,
  root: TreeNode
): number {
  const availableWidth =
    treeView.offscreenCanvas.width -
    getMaxLabelWidth(ctx, treeView) -
    getColorTracksWidth(treeView) -
    TREE_LEFT_MARGIN
  const depth =
    treeView.accessionStyle === "tree_simple"
      ? getTreeDepth(root)
      : getTreeDepthLinear(root)
  return depth > 0 ? Math.max(availableWidth, 0) / depth : 0
}

function updateOffscreenCanvasWidth(
  treeView: AccessionTreeView,
  theme: PlotTheme
) {
  const ctx = treeView.offscreenCanvas.getContext("2d")
  if (!ctx) {
    return
  }
  ctx.font = formatCanvasFont(treeView.textSize, theme.monoFont)
  if (treeView.paneWidth !== undefined) {
    treeView.offscreenCanvas.width = treeView.paneWidth
    return
  }
  // Rounding width to a multiple of the text size
  const width =
    treeView.accessionStyle === "labels"
      ? ceilTo(
          getMaxLabelWidth(ctx, treeView) + getColorTracksWidth(treeView),
          treeView.textSize
        )
      : ceilTo(
          treeView.containerSize.width * treeView.containerProportion,
          treeView.textSize
        )
  treeView.offscreenCanvas.width = width
}

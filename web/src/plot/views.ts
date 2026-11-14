import deepEqual from "fast-deep-equal"

import { ceilTo } from "@/lib/genome"
import type {
  AccessionDictionary,
  AccessionDisplayStyle,
  ContainerSize,
  DistanceBins,
  PheneticTree,
  PlotPosition,
  SequenceInterval,
} from "@/lib/types"

/**
 * State of the accession label / tree pane. Setters flag when the cached
 * off-screen rendering is stale.
 */
export class AccessionTreeView {
  /** Default tree container width in pixels. */
  static readonly DEFAULT_CONTAINER_WIDTH = 600

  /**
   * The stored canvas height is limited by browser canvas size limits. The
   * image is redrawn when the user scrolls past it.
   */
  static readonly STORED_CANVAS_HEIGHT = 16000

  /** Vertical step when shifting the stored canvas, as a proportion of it. */
  static readonly STORED_CANVAS_OFFSET_STEP = 0.5

  offscreenCanvas: HTMLCanvasElement
  redrawRequired = true
  /** Proportion of the container the tree may take up. */
  containerProportion = 1
  /** Gap between colour tracks, in pixels. */
  colorTrackGap = 0
  /** Tree line width in pixels; scales with the text size when undefined. */
  lineWidth: number | undefined
  /** Dash pattern of leader lines; scales with the text size when undefined. */
  leaderDash: number[] | undefined
  /** Right-align labels against the colour tracks (labels style only). */
  alignLabelsRight = false

  private _accessionDictionary: AccessionDictionary | undefined
  private _accessionStyle: AccessionDisplayStyle = "tree_linear"
  private _canvasOffsetY = 0
  private _colorTrackWidth: number
  private _containerSize: ContainerSize
  private _orderedAccessions: string[]
  private _paneWidth: number | undefined
  private _reference: string | undefined
  private _textSize: number
  private _tree: PheneticTree

  constructor(
    tree: PheneticTree,
    orderedAccessions: string[],
    textSize: number,
    containerSize?: ContainerSize
  ) {
    this._tree = structuredClone(tree)
    this._orderedAccessions = [...orderedAccessions]
    this._textSize = textSize
    this._containerSize = containerSize
      ? { ...containerSize }
      : {
          width: AccessionTreeView.DEFAULT_CONTAINER_WIDTH,
          height: orderedAccessions.length * textSize,
        }
    this._colorTrackWidth = textSize
    this.offscreenCanvas = document.createElement("canvas")
    this.offscreenCanvas.height = AccessionTreeView.STORED_CANVAS_HEIGHT
  }

  get accessionCount(): number {
    return this.orderedAccessions.length
  }

  set accessionDictionary(dictionary: AccessionDictionary | undefined) {
    if (!deepEqual(dictionary, this._accessionDictionary)) {
      this._accessionDictionary = structuredClone(dictionary)
      this.redrawRequired = true
    }
  }
  get accessionDictionary(): AccessionDictionary | undefined {
    return this._accessionDictionary
  }

  set accessionStyle(style: AccessionDisplayStyle) {
    if (style !== this._accessionStyle) {
      this._accessionStyle = style
      this.redrawRequired = true
    }
  }
  get accessionStyle(): AccessionDisplayStyle {
    return this._accessionStyle
  }

  set canvasOffsetY(offsetY: number) {
    if (!this.isVisibleAreaDrawn(offsetY)) {
      this.updateOffset(offsetY)
      this.redrawRequired = true
    }
  }
  get canvasOffsetY(): number {
    return this._canvasOffsetY
  }

  set colorTrackWidth(width: number) {
    if (width !== this._colorTrackWidth) {
      this._colorTrackWidth = width
      this.redrawRequired = true
    }
  }
  get colorTrackWidth(): number {
    return this._colorTrackWidth
  }

  set containerSize(size: ContainerSize) {
    if (
      size.width !== this._containerSize.width ||
      size.height !== this._containerSize.height
    ) {
      this._containerSize = { ...size }
      this.redrawRequired = true
    }
  }
  get containerSize(): ContainerSize {
    return this._containerSize
  }

  set orderedAccessions(accessions: string[]) {
    if (!deepEqual(accessions, this._orderedAccessions)) {
      this._orderedAccessions = [...accessions]
      this.redrawRequired = true
    }
  }
  get orderedAccessions(): string[] {
    return this._orderedAccessions
  }

  /** Fixed width of the pane; sized to its content when undefined. */
  set paneWidth(width: number | undefined) {
    if (width !== this._paneWidth) {
      this._paneWidth = width
      this.redrawRequired = true
    }
  }
  get paneWidth(): number | undefined {
    return this._paneWidth
  }

  /** The reference accession, whose label is emphasised. */
  set reference(reference: string | undefined) {
    if (reference !== this._reference) {
      this._reference = reference
      this.redrawRequired = true
    }
  }
  get reference(): string | undefined {
    return this._reference
  }

  set tree(tree: PheneticTree) {
    if (!deepEqual(tree.query, this._tree.query)) {
      this._tree = structuredClone(tree)
      this.redrawRequired = true
    }
  }
  get tree(): PheneticTree {
    return this._tree
  }

  set textSize(textSize: number) {
    if (textSize !== this._textSize) {
      this._textSize = textSize
      this.redrawRequired = true
    }
  }
  get textSize(): number {
    return this._textSize
  }

  /**
   * Height of the canvas that overflows the container: the pre-drawn area
   * still available for scrolling. When negative, more needs to be drawn.
   */
  private getOverflowHeight(containerOffsetY: number): number {
    return (
      AccessionTreeView.STORED_CANVAS_HEIGHT -
      this.containerSize.height +
      containerOffsetY -
      this._canvasOffsetY
    )
  }

  private isVisibleAreaDrawn(containerOffsetY: number): boolean {
    const overflow = this.getOverflowHeight(containerOffsetY)
    return (
      overflow > 0 &&
      overflow <=
        AccessionTreeView.STORED_CANVAS_HEIGHT - this.containerSize.height
    )
  }

  private updateOffset(containerOffsetY: number) {
    const limit =
      AccessionTreeView.STORED_CANVAS_HEIGHT - this.containerSize.height
    if (limit <= 0) {
      // Container taller than the stored canvas; nothing sensible to shift.
      return
    }
    const offsetStep = ceilTo(
      AccessionTreeView.STORED_CANVAS_OFFSET_STEP *
        AccessionTreeView.STORED_CANVAS_HEIGHT,
      this.textSize
    )
    while (this.getOverflowHeight(containerOffsetY) <= 0) {
      this._canvasOffsetY -= offsetStep
    }
    while (this.getOverflowHeight(containerOffsetY) > limit) {
      this._canvasOffsetY += offsetStep
    }
  }
}

/** Marks individual heatmap cells, keyed by bin (column) index. */
export type BinHighlights = Map<number, number[]>

/** State of the distance heatmap. */
export class DistanceBinView {
  static readonly DEFAULT_ASPECT_RATIO = 1 / 2

  imageArray: Uint8ClampedArray<ArrayBuffer> = new Uint8ClampedArray(0)
  redrawRequired = true

  /** Bin width / height. */
  aspectRatio = DistanceBinView.DEFAULT_ASPECT_RATIO
  binHeight: number
  containerSize: ContainerSize | undefined
  orderedAccessions: string[]
  plotPosition: PlotPosition = { x: 0, y: 0 }
  sequenceGaps: SequenceInterval[] | undefined
  highlights: BinHighlights | undefined

  private _distanceBins: DistanceBins

  constructor(
    distanceBins: DistanceBins,
    orderedAccessions: string[],
    binHeight: number
  ) {
    this._distanceBins = distanceBins
    this.orderedAccessions = orderedAccessions
    this.binHeight = binHeight
  }

  get binsize(): number {
    return this.distanceBins.query.binsize
  }

  get binWidth(): number {
    return this.binHeight * this.aspectRatio
  }

  get colNum(): number {
    // The number of bins is the same for all accessions
    return Object.values(this.distanceBins.bins)[0]?.length ?? 0
  }

  set distanceBins(distanceBins: DistanceBins) {
    if (distanceBins !== this._distanceBins) {
      this._distanceBins = distanceBins
      this.redrawRequired = true
    }
  }
  get distanceBins(): DistanceBins {
    return this._distanceBins
  }

  get rowNum(): number {
    return this.orderedAccessions.length
  }

  get interval(): number[] {
    return this.distanceBins.query.interval
  }
}

/** State of the genomic ruler above the heatmap. */
export class ScaleView {
  plotPosition: PlotPosition = { x: 0, y: 0 }
  interval: number[]
  binsize: number
  binWidth: number
  scaleBarHeight: number
  containerSize: ContainerSize | undefined

  constructor(
    interval: number[],
    binsize: number,
    binWidth: number,
    scaleBarHeight: number,
    containerSize?: ContainerSize
  ) {
    this.interval = interval
    this.binsize = binsize
    this.binWidth = binWidth
    this.scaleBarHeight = scaleBarHeight
    this.containerSize = containerSize
  }

  get bpPerPixel(): number {
    return this.binsize / this.binWidth
  }

  /** Convert a base-pair position to a canvas pixel position. */
  bpToPixelPosition(bpPosition: number): number {
    return (bpPosition - this.interval[0]) / this.bpPerPixel
  }
}

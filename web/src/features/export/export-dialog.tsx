import { CircleAlertIcon, DownloadIcon } from "lucide-react"
import { useMemo, useState } from "react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { clamp } from "@/lib/genome"
import type { AccessionDisplayStyle } from "@/lib/types"
import { getBinImageData, getBinImageSize } from "@/plot/draw-bins"
import { getScaleImageData, getScaleImageSize } from "@/plot/draw-scale"
import { getTreeImageData, getTreeImageSize } from "@/plot/draw-tree"
import { readLightPlotTheme } from "@/plot/theme"
import { AccessionTreeView, DistanceBinView, ScaleView } from "@/plot/views"
import { usePlotStore } from "@/store/plot-store"

const DEFAULT_BIN_HEIGHT = 10
const MAX_BIN_HEIGHT = 50
/** Scale bar height as a proportion of bin height. */
const SCALE_BAR_HEIGHT = 1.25

const STYLES: { value: AccessionDisplayStyle; label: string }[] = [
  { value: "labels", label: "Accession labels" },
  { value: "tree_linear", label: "Phenetic tree" },
  { value: "tree_simple", label: "Phenetic tree (simplified)" },
]

interface ExportOptions {
  accessionStyle: AccessionDisplayStyle
  binHeight: number
  /** Width of the label / tree pane; only used for the tree styles. */
  labelWidth: number | undefined
}

/** Full-size views of the current plot, rendered with the light theme. */
function buildViews(options: ExportOptions) {
  const state = usePlotStore.getState()
  if (!state.distanceBins || !state.orderedAccessions) {
    return null
  }
  const theme = readLightPlotTheme()
  const { binHeight } = options

  const binView = new DistanceBinView(
    state.distanceBins,
    state.orderedAccessions,
    binHeight
  )
  binView.sequenceGaps = state.sequenceGaps

  const treeView = new AccessionTreeView(
    state.pheneticTree,
    state.orderedAccessions,
    binHeight
  )
  treeView.accessionDictionary = state.accessionDictionary
  treeView.accessionStyle = options.accessionStyle
  if (options.labelWidth !== undefined && options.accessionStyle !== "labels") {
    treeView.containerSize = {
      height: treeView.containerSize.height,
      width: options.labelWidth,
    }
  }

  const { interval, binsize } = state.distanceBins.query
  const scaleView = new ScaleView(
    interval,
    binsize,
    binHeight * binView.aspectRatio,
    binHeight * SCALE_BAR_HEIGHT
  )

  const binSize = getBinImageSize(binView)
  const treeSize = getTreeImageSize(treeView, theme)
  const scaleSize = getScaleImageSize(scaleView)
  return {
    theme,
    binView,
    treeView,
    scaleView,
    treeSize,
    scaleSize,
    totalSize: {
      width: Math.ceil(binSize.width + treeSize.width),
      height: Math.floor(binSize.height + scaleSize.height),
    },
  }
}

function renderImage(views: NonNullable<ReturnType<typeof buildViews>>) {
  return new Promise<Blob>((resolve, reject) => {
    const { theme, binView, treeView, scaleView, treeSize, scaleSize } = views
    const canvas = document.createElement("canvas")
    canvas.width = views.totalSize.width
    canvas.height = views.totalSize.height
    const ctx = canvas.getContext("2d")
    if (!ctx) {
      reject(new Error("Canvas is not available"))
      return
    }
    ctx.putImageData(getTreeImageData(treeView, theme), 0, scaleSize.height)
    ctx.putImageData(
      getBinImageData(binView, theme),
      treeSize.width,
      scaleSize.height
    )
    ctx.putImageData(getScaleImageData(scaleView, theme), treeSize.width, 0)
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob)
      } else {
        reject(new Error("Image could not be encoded"))
      }
    })
  })
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function NumberField({
  id,
  label,
  value,
  readOnly,
  ...props
}: Omit<React.ComponentProps<typeof Input>, "value"> & {
  label: string
  value: number
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        className="w-full text-right font-mono"
        value={Number.isFinite(value) ? value : ""}
        readOnly={readOnly}
        {...props}
      />
    </div>
  )
}

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const [options, setOptions] = useState<ExportOptions>({
    accessionStyle: "labels",
    binHeight: DEFAULT_BIN_HEIGHT,
    labelWidth: undefined,
  })
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")

  const views = useMemo(() => buildViews(options), [options])
  const labelWidth = views?.treeSize.width ?? 0
  const totalSize = views?.totalSize ?? { width: 0, height: 0 }

  const download = () => {
    if (!views) {
      return
    }
    setErrorMessage("")
    setLoading(true)
    // Deferred so the progress bar is painted before the heavy rendering.
    setTimeout(() => {
      const { chromosome, interval } = usePlotStore.getState()
      Promise.resolve()
        .then(() => renderImage(views))
        .then((blob) => {
          saveBlob(
            blob,
            `${chromosome?.name}_${interval?.[0]}-${interval?.[1]}.png`
          )
          onClose()
        })
        .catch(() => {
          setErrorMessage("Total resolution too high.")
          setLoading(false)
        })
    }, 200)
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[360px]">
        <DialogHeader>
          <DialogTitle>Export plot image</DialogTitle>
        </DialogHeader>

        <fieldset disabled={loading} className="flex flex-col gap-2.5">
          <div className="flex flex-col gap-1.5">
            <Label id="export-labels">Labels</Label>
            <RadioGroup
              aria-labelledby="export-labels"
              className="gap-1.5"
              value={options.accessionStyle}
              onValueChange={(value) =>
                setOptions((current) => ({
                  ...current,
                  accessionStyle: value as AccessionDisplayStyle,
                }))
              }
            >
              {STYLES.map((style) => (
                // The min-height is 0 at compact density and 44px on touch.
                <div
                  key={style.value}
                  className="flex min-h-[calc((var(--cb)-12px)*5.5)] items-center gap-2"
                >
                  <RadioGroupItem
                    value={style.value}
                    id={`export-style-${style.value}`}
                  />
                  <Label
                    htmlFor={`export-style-${style.value}`}
                    className="flex-1 self-stretch font-normal"
                  >
                    {style.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <NumberField
              id="export-bin-height"
              label="Bin / font size"
              min={1}
              max={MAX_BIN_HEIGHT}
              value={options.binHeight}
              onChange={(event) =>
                setOptions((current) => ({
                  ...current,
                  binHeight: clamp(
                    parseInt(event.target.value, 10) || 1,
                    1,
                    MAX_BIN_HEIGHT
                  ),
                }))
              }
            />
            <NumberField
              id="export-label-width"
              label="Label width (px)"
              min={options.binHeight}
              step={options.binHeight}
              value={labelWidth}
              readOnly={options.accessionStyle === "labels"}
              onChange={(event) =>
                setOptions((current) => ({
                  ...current,
                  labelWidth: Math.max(
                    parseInt(event.target.value, 10) || current.binHeight,
                    current.binHeight
                  ),
                }))
              }
            />
            <ReadOnlySize label="Total width" value={totalSize.width} />
            <ReadOnlySize label="Total height" value={totalSize.height} />
            {/* Phones: both on one line. */}
            <div className="col-span-2 flex items-baseline gap-2 sm:hidden">
              <span className="text-muted-foreground">Total size</span>
              <span className="truncate font-mono text-sm">
                {formatSize(totalSize.width)} × {formatSize(totalSize.height)}{" "}
                px
              </span>
            </div>
          </div>
        </fieldset>

        {loading && <IndeterminateProgress />}
        {errorMessage && (
          <Alert variant="destructive">
            <CircleAlertIcon />
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={loading || !views} onClick={download}>
            {loading ? <Spinner /> : <DownloadIcon />}
            {loading ? "Loading…" : "Download PNG"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function formatSize(value: number) {
  return Number.isFinite(value) ? value.toLocaleString("en-US") : "–"
}

/** A computed size: 14px mono with a px suffix. */
function ReadOnlySize({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-0.5 max-sm:hidden">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-sm">{formatSize(value)} px</span>
    </div>
  )
}

/** 3px indeterminate progress bar. */
function IndeterminateProgress() {
  return (
    <div className="relative h-[3px] overflow-hidden rounded-full bg-secondary">
      <div className="absolute inset-y-0 w-2/5 animate-[indeterminate_1.2s_linear_infinite] bg-primary" />
    </div>
  )
}

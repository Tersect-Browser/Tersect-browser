import { DownloadIcon } from "lucide-react"
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
import { Progress } from "@/components/ui/progress"
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
    <div className="grid grid-cols-[8rem_1fr] items-center gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        className="w-28 font-mono"
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export plot image</DialogTitle>
        </DialogHeader>

        <fieldset disabled={loading} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <div className="text-sm font-medium">Labels</div>
            <RadioGroup
              value={options.accessionStyle}
              onValueChange={(value) =>
                setOptions((current) => ({
                  ...current,
                  accessionStyle: value as AccessionDisplayStyle,
                }))
              }
            >
              {STYLES.map((style) => (
                <div key={style.value} className="flex items-center gap-2">
                  <RadioGroupItem
                    value={style.value}
                    id={`export-style-${style.value}`}
                  />
                  <Label htmlFor={`export-style-${style.value}`}>
                    {style.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          <div className="flex flex-col gap-2">
            <div className="text-sm font-medium">Image size (px)</div>
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
              label="Label width"
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
            <NumberField
              id="export-total-width"
              label="Total width"
              value={totalSize.width}
              readOnly
            />
            <NumberField
              id="export-total-height"
              label="Total height"
              value={totalSize.height}
              readOnly
            />
          </div>
        </fieldset>

        {loading && <Progress className="animate-pulse" value={100} />}
        {errorMessage && (
          <Alert variant="destructive">
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={loading || !views} onClick={download}>
            <DownloadIcon />
            {loading ? "Loading..." : "Download"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

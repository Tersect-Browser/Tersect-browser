import {
  DatabaseIcon,
  DownloadIcon,
  EraserIcon,
  ListIcon,
  MinusIcon,
  PlusIcon,
  SearchIcon,
  Share2Icon,
  DnaIcon,
  WaypointsIcon,
} from "lucide-react"
import { useMemo, useState } from "react"
import type { ReactNode } from "react"

import { Combobox } from "@/components/combobox"
import { TreeIcon, TreeSimplifiedIcon } from "@/components/icons"
import { IntervalControl } from "@/components/interval-control"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { ExportDialog } from "@/features/export/export-dialog"
import { SharePopover } from "@/features/export/share-popover"
import { formatMbp, formatSize } from "@/lib/format"
import type { AccessionDisplayStyle } from "@/lib/types"
import { cn } from "@/lib/utils"
import {
  BINSIZE_MAX,
  BINSIZE_MIN,
  BINSIZE_STEP,
  MAX_ZOOM_LEVEL,
  MIN_ZOOM_LEVEL,
  usePlotStore,
} from "@/store/plot-store"
import { useUiStore } from "@/store/ui-store"

/** Label shown beside the icon from this width up; tooltip only below. */
const LABEL_CLASS = "hidden min-[1180px]:inline"

/** A captioned group of controls. */
function Group({
  caption,
  className,
  children,
}: {
  caption: string
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-[3px]", className)}>
      <div className="caption text-[9.5px] leading-none">{caption}</div>
      <div className="flex min-w-0 items-center gap-[5px]">{children}</div>
    </div>
  )
}

/** Button that drops its label to a tooltip on narrow screens. */
function ActionButton({
  icon,
  label,
  ...props
}: React.ComponentProps<typeof Button> & { icon: ReactNode; label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button aria-label={label} {...props}>
          {icon}
          <span className={LABEL_CLASS}>{label}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent className="min-[1180px]:hidden">{label}</TooltipContent>
    </Tooltip>
  )
}

const STYLES: {
  value: AccessionDisplayStyle
  label: string
  icon: ReactNode
}[] = [
  { value: "labels", label: "Accession labels", icon: <ListIcon /> },
  { value: "tree_linear", label: "Phenetic tree", icon: <TreeIcon /> },
  {
    value: "tree_simple",
    label: "Phenetic tree (simplified)",
    icon: <TreeSimplifiedIcon />,
  },
]

function DisplayStyleSelector() {
  const accessionStyle = usePlotStore((state) => state.accessionStyle)
  const setAccessionStyle = usePlotStore((state) => state.setAccessionStyle)
  return (
    <div
      role="radiogroup"
      aria-label="Display style"
      className="flex shrink-0 overflow-hidden rounded-lg border"
    >
      {STYLES.map((style) => {
        const active = style.value === accessionStyle
        return (
          <Tooltip key={style.value}>
            <TooltipTrigger asChild>
              <button
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={style.label}
                className={cn(
                  "flex size-(--control) items-center justify-center border-l outline-none first:border-l-0 focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-inset [&_svg]:size-[13px]",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "bg-background hover:bg-accent"
                )}
                onClick={() => setAccessionStyle(style.value)}
              >
                {style.icon}
              </button>
            </TooltipTrigger>
            <TooltipContent>{style.label}</TooltipContent>
          </Tooltip>
        )
      })}
    </div>
  )
}

function AccessionsButton() {
  const count = usePlotStore((state) => state.accessions?.length ?? 0)
  const setOpen = useUiStore((state) => state.setAccessionSheetOpen)
  return (
    <Button
      variant="outline"
      className="shrink-0"
      aria-label="Select accessions"
      onClick={() => setOpen(true)}
    >
      <DatabaseIcon />
      <span className={LABEL_CLASS}>Accessions</span>
      <span className="rounded-sm bg-muted px-1 font-mono text-[10px] leading-4 text-muted-foreground">
        {count}
      </span>
    </Button>
  )
}

function ReferenceSelector() {
  const accessionInfos = usePlotStore((state) => state.accessionInfos)
  const accessions = usePlotStore((state) => state.accessions)
  const reference = usePlotStore((state) => state.reference)
  const setReference = usePlotStore((state) => state.setReference)

  // The reference must be one of the plotted accessions.
  const options = useMemo(() => {
    const plotted = new Set(accessions)
    return (accessionInfos ?? [])
      .filter((info) => plotted.has(info.id))
      .map((info) => ({ value: info.id, label: info.Label }))
  }, [accessionInfos, accessions])

  return (
    <Combobox
      aria-label="Reference accession"
      className="w-[220px] min-w-[140px] shrink"
      prefix="Ref"
      options={options}
      value={reference}
      onChange={setReference}
      placeholder="Select reference"
      searchPlaceholder="Search accessions..."
    />
  )
}

function ChromosomeSelector() {
  const chromosomes = usePlotStore((state) => state.chromosomes)
  const chromosome = usePlotStore((state) => state.chromosome)
  const setChromosome = usePlotStore((state) => state.setChromosome)
  return (
    <Select
      value={chromosome?.name ?? ""}
      onValueChange={(name) => {
        const selected = chromosomes.find((chrom) => chrom.name === name)
        if (selected) {
          setChromosome(selected)
        }
      }}
    >
      <SelectTrigger aria-label="Chromosome" className="shrink-0 font-mono">
        <SelectValue placeholder="Chromosome" />
      </SelectTrigger>
      <SelectContent>
        {chromosomes.map((chrom) => (
          <SelectItem key={chrom.name} value={chrom.name} className="font-mono">
            {chrom.name}
            {/* Size is listed in the menu only, to save toolbar width. */}
            <span className="text-muted-foreground in-data-[slot=select-value]:hidden">
              {formatMbp(chrom.size)}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function IntervalSelector() {
  const interval = usePlotStore((state) => state.interval)
  const chromosomeSize = usePlotStore((state) => state.chromosome?.size ?? 1)
  const setInterval = usePlotStore((state) => state.setInterval)
  return (
    <IntervalControl
      className="min-w-0 flex-1"
      min={1}
      max={chromosomeSize}
      value={interval ?? [1, chromosomeSize]}
      onChange={setInterval}
    />
  )
}

function BinsizeSelector() {
  const binsize = usePlotStore((state) => state.binsize)
  const setBinsize = usePlotStore((state) => state.setBinsize)
  // Value under the thumb while dragging.
  const [dragging, setDragging] = useState<number | null>(null)
  const shown = dragging ?? binsize ?? BINSIZE_MIN
  return (
    <div className="flex shrink-0 items-center gap-[5px]">
      <Slider
        aria-label="Bin size"
        className="w-[70px]"
        min={BINSIZE_MIN}
        max={BINSIZE_MAX}
        step={BINSIZE_STEP}
        value={[shown]}
        onValueChange={([value]) => setDragging(value)}
        onValueCommit={([value]) => {
          setDragging(null)
          setBinsize(value)
        }}
      />
      <span className="w-[74px] text-right font-mono">{formatSize(shown)}</span>
    </div>
  )
}

function ZoomControl() {
  const zoomLevel = usePlotStore((state) => state.zoomLevel)
  const zoomIn = usePlotStore((state) => state.zoomIn)
  const zoomOut = usePlotStore((state) => state.zoomOut)
  return (
    <div className="flex shrink-0 items-center overflow-hidden rounded-lg border">
      <Button
        variant="ghost"
        size="icon"
        className="rounded-none"
        aria-label="Zoom out"
        disabled={zoomLevel <= MIN_ZOOM_LEVEL}
        onClick={zoomOut}
      >
        <MinusIcon />
      </Button>
      <span className="w-11 border-x text-center font-mono leading-(--control)">
        {zoomLevel}%
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="rounded-none"
        aria-label="Zoom in"
        disabled={zoomLevel >= MAX_ZOOM_LEVEL}
        onClick={zoomIn}
      >
        <PlusIcon />
      </Button>
    </div>
  )
}

interface ToolbarProps {
  /** False while the plot is loading or showing an error. */
  plotReady: boolean
}

export function Toolbar({ plotReady }: ToolbarProps) {
  const [exportOpen, setExportOpen] = useState(false)
  const genomeTrackVisible = useUiStore((state) => state.genomeTrackVisible)
  const toggleGenomeTrack = useUiStore((state) => state.toggleGenomeTrack)
  const openVariantSearch = useUiStore((state) => state.openVariantSearch)
  const setIntrogressionTarget = useUiStore(
    (state) => state.setIntrogressionTarget
  )
  const hasMatches = usePlotStore((state) => state.variantMatches !== null)
  const setVariantMatches = usePlotStore((state) => state.setVariantMatches)

  const startIntrogression = () => {
    const { chromosome, interval } = usePlotStore.getState()
    if (chromosome && interval) {
      setIntrogressionTarget({ chromosome: chromosome.name, interval })
    }
  }

  return (
    <div className="z-10 shrink-0 border-b bg-card px-2.5 pt-[5px] pb-[7px]">
      {/* Row 1: what is shown, and where */}
      <div className="flex items-end gap-2.5 pb-[5px]">
        <Group caption="Show" className="shrink">
          <DisplayStyleSelector />
          <AccessionsButton />
          <ReferenceSelector />
        </Group>
        <Group caption="Where" className="flex-1">
          <ChromosomeSelector />
          <IntervalSelector />
          <BinsizeSelector />
          <ZoomControl />
        </Group>
      </div>

      {/* Row 2: analysis and output */}
      <div className="flex items-end gap-2.5 border-t pt-[5px]">
        <Group caption="Analysis">
          <div className="flex">
            <ActionButton
              variant="outline"
              className="rounded-r-none"
              icon={<SearchIcon />}
              label="Variant search"
              onClick={() => openVariantSearch()}
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="-ml-px rounded-l-none"
                  aria-label="Clear variant highlighting"
                  disabled={!hasMatches}
                  onClick={() => setVariantMatches(null)}
                >
                  <EraserIcon />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Clear variant highlighting</TooltipContent>
            </Tooltip>
          </div>
          <ActionButton
            variant="outline"
            icon={<WaypointsIcon />}
            label="Introgression"
            onClick={startIntrogression}
          />
          <ActionButton
            variant={genomeTrackVisible ? "secondary" : "outline"}
            aria-pressed={genomeTrackVisible}
            className={cn(genomeTrackVisible && "border-primary text-primary")}
            icon={<DnaIcon />}
            label="Gene track"
            onClick={toggleGenomeTrack}
          />
        </Group>
        <Group caption="Output" className="ml-auto">
          <ActionButton
            variant="outline"
            disabled={!plotReady}
            icon={<DownloadIcon />}
            label="Export"
            onClick={() => setExportOpen(true)}
          />
          <SharePopover
            trigger={<ActionButton icon={<Share2Icon />} label="Share" />}
          />
        </Group>
      </div>

      {exportOpen && <ExportDialog onClose={() => setExportOpen(false)} />}
    </div>
  )
}

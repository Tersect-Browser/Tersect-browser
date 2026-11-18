import {
  DatabaseIcon,
  DownloadIcon,
  EraserIcon,
  GitMergeIcon,
  ListIcon,
  MinusIcon,
  PlusIcon,
  SearchIcon,
  Share2Icon,
  DnaIcon,
} from "lucide-react"
import { useMemo, useRef, useState } from "react"
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
import { useIsTouchLayout } from "@/hooks/use-breakpoint"
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
import { clearVariantResults } from "@/features/variants/search"
import { useUiStore } from "@/store/ui-store"
import type { ToolbarSheet } from "@/store/ui-store"

/**
 * Label shown beside the icon from this width up; tooltip only below. In the
 * touch layouts (below 1024px) the buttons sit in a sheet and always show it.
 */
const LABEL_CLASS = "hidden max-lg:inline min-[1180px]:inline"

/** Lists opened from a toolbar sheet span the sheet's content width. */
const SHEET_LIST_CLASS = "max-lg:w-[calc(100vw-2rem)]"
const SHEET_PADDING = 16

/**
 * A captioned group of controls. In the touch layouts each group is the
 * content of one toolbar sheet, shown only while its tab is open.
 */
function Group({
  sheet,
  caption,
  className,
  children,
}: {
  sheet: Exclude<ToolbarSheet, "none">
  caption: string
  className?: string
  children: ReactNode
}) {
  const open = useUiStore((state) => state.toolbarSheet === sheet)
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-[3px] max-lg:ml-0 max-lg:flex-none max-lg:gap-2",
        !open && "max-lg:hidden",
        className
      )}
    >
      <div className="caption text-t9 leading-none">{caption}</div>
      <div className="flex min-w-0 items-center gap-[5px] max-lg:flex-wrap max-lg:gap-2">
        {children}
      </div>
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
      <TooltipContent className="max-lg:hidden min-[1180px]:hidden">
        {label}
      </TooltipContent>
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
      <span className="rounded-sm bg-muted px-1 font-mono text-t10 leading-4 text-muted-foreground">
        {count}
      </span>
    </Button>
  )
}

function ReferenceSelector() {
  const touch = useIsTouchLayout()
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
      className="w-[220px] min-w-[140px] shrink max-lg:w-full max-lg:basis-full"
      contentClassName={SHEET_LIST_CLASS}
      side={touch ? "top" : undefined}
      collisionPadding={touch ? SHEET_PADDING : undefined}
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
  const touch = useIsTouchLayout()
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
      {/* In a sheet the list opens upward and spans the sheet. */}
      <SelectContent
        position={touch ? "popper" : "item-aligned"}
        side={touch ? "top" : undefined}
        align={touch ? "start" : undefined}
        collisionPadding={touch ? SHEET_PADDING : undefined}
        className={SHEET_LIST_CLASS}
      >
        {chromosomes.map((chrom) => (
          <SelectItem
            key={chrom.name}
            value={chrom.name}
            className="min-h-(--c22) font-mono"
          >
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
      className="min-w-0 flex-1 max-lg:basis-full"
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
        className="w-[70px] max-lg:h-7 max-lg:w-28"
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
      <span className="w-[74px] text-right font-mono whitespace-nowrap max-lg:w-24">
        {formatSize(shown)}
      </span>
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
      <span className="w-11 border-x text-center font-mono leading-(--control) max-lg:w-16">
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
  const sheetRef = useRef<HTMLDivElement>(null)
  const sheet = useUiStore((state) => state.toolbarSheet)
  const setSheet = useUiStore((state) => state.setToolbarSheet)
  const genomeTrackVisible = useUiStore((state) => state.genomeTrackVisible)
  const toggleGenomeTrack = useUiStore((state) => state.toggleGenomeTrack)
  const openVariantSearch = useUiStore((state) => state.openVariantSearch)
  const setIntrogressionTarget = useUiStore(
    (state) => state.setIntrogressionTarget
  )
  const hasMatches = usePlotStore((state) => state.variantMatches !== null)
  const introgressionOpen = useUiStore(
    (state) => state.introgressionTarget !== null
  )
  const requestIntrogressionClose = useUiStore(
    (state) => state.requestIntrogressionClose
  )

  const toggleIntrogression = () => {
    setSheet("none")
    if (introgressionOpen) {
      // The panel asks for confirmation if a job is running.
      requestIntrogressionClose()
      return
    }
    const { chromosome, interval } = usePlotStore.getState()
    if (chromosome && interval) {
      setIntrogressionTarget({ chromosome: chromosome.name, interval })
    }
  }

  return (
    <>
      {/* Touch layouts: scrim from the top bar down to the tab bar. */}
      {sheet !== "none" && (
        <button
          type="button"
          aria-label="Close toolbar sheet"
          tabIndex={-1}
          className="absolute inset-x-0 top-0 bottom-[calc(var(--tabbar)+env(safe-area-inset-bottom))] z-40 cursor-default bg-black/30 lg:hidden"
          onClick={() => setSheet("none")}
        />
      )}
      {/* A two-row bar on desktop. Below 1024px there is no bar: the group
          picked in the bottom tab bar is shown as a sheet right above it. */}
      <div
        ref={sheetRef}
        id="toolbar-sheet"
        className={cn(
          "z-10 shrink-0 border-b bg-card px-2.5 pt-[5px] pb-[7px]",
          "max-lg:absolute max-lg:inset-x-0 max-lg:bottom-[calc(var(--tabbar)+env(safe-area-inset-bottom))] max-lg:z-[41] max-lg:flex max-lg:max-h-[calc(100%-var(--tabbar)-env(safe-area-inset-bottom))] max-lg:flex-col max-lg:gap-2.5 max-lg:overflow-y-auto max-lg:rounded-t-[14px] max-lg:border-t max-lg:border-b-0 max-lg:px-4 max-lg:pt-3.5 max-lg:pb-[18px] max-lg:shadow-[0_-8px_32px_rgb(0_0_0/0.22)]",
          sheet === "none" && "max-lg:hidden"
        )}
      >
        {/* Row 1: what is shown, and where */}
        <div className="flex items-end gap-2.5 pb-[5px] max-lg:contents">
          <Group sheet="show" caption="Show" className="shrink">
            <DisplayStyleSelector />
            <AccessionsButton />
            <ReferenceSelector />
          </Group>
          <Group sheet="where" caption="Where" className="flex-1">
            <ChromosomeSelector />
            <IntervalSelector />
            <BinsizeSelector />
            <ZoomControl />
          </Group>
        </div>

        {/* Row 2: analysis and output */}
        <div className="flex items-end gap-2.5 border-t pt-[5px] max-lg:contents">
          <Group sheet="analysis" caption="Analysis">
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
                    onClick={clearVariantResults}
                  >
                    <EraserIcon />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Clear variant highlighting</TooltipContent>
              </Tooltip>
            </div>
            <ActionButton
              variant="outline"
              aria-pressed={introgressionOpen}
              className={cn(introgressionOpen && "bg-accent")}
              icon={<GitMergeIcon />}
              label="Introgression"
              onClick={toggleIntrogression}
            />
            <ActionButton
              variant="outline"
              aria-pressed={genomeTrackVisible}
              className={cn(genomeTrackVisible && "bg-accent")}
              icon={<DnaIcon />}
              label="Gene track"
              onClick={toggleGenomeTrack}
            />
          </Group>
          <Group sheet="output" caption="Output" className="ml-auto">
            <ActionButton
              variant="outline"
              disabled={!plotReady}
              icon={<DownloadIcon />}
              label="Export"
              onClick={() => {
                setSheet("none")
                setExportOpen(true)
              }}
            />
            <SharePopover
              sheetRef={sheetRef}
              trigger={<ActionButton icon={<Share2Icon />} label="Share" />}
            />
          </Group>
        </div>
      </div>
      {exportOpen && <ExportDialog onClose={() => setExportOpen(false)} />}
    </>
  )
}

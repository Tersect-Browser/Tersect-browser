import { EraserIcon, Table2Icon } from "lucide-react"
import { useMemo } from "react"

import { Button } from "@/components/ui/button"
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer"
import { useIsTouchLayout } from "@/hooks/use-breakpoint"
import { formatLocus, formatPosition } from "@/lib/format"
import type { Variant } from "@/lib/types"
import { cn } from "@/lib/utils"
import { usePlotStore } from "@/store/plot-store"
import { useUiStore } from "@/store/ui-store"

import { clearVariantResults } from "./search"

const IMPACT_ORDER = ["HIGH", "MODERATE", "LOW", "MODIFIER"]

/** Matching variants on the plotted chromosome, with their bin. */
function usePlottedMatches() {
  const matches = usePlotStore((state) => state.variantMatches)
  const distanceBins = usePlotStore((state) => state.distanceBins)
  return useMemo(() => {
    if (!matches || !distanceBins) {
      return null
    }
    const {
      chromosome_name: chromosome,
      interval,
      binsize,
    } = distanceBins.query
    const rows = matches.variants
      .filter(
        (variant) =>
          variant.chr === chromosome &&
          variant.pos.start >= interval[0] &&
          variant.pos.start <= interval[1]
      )
      .map((variant) => ({
        variant,
        bin: Math.floor((variant.pos.start - interval[0]) / binsize),
      }))
    return { matches, rows, chromosome }
  }, [matches, distanceBins])
}

/** The most severe effect of a variant (the one its impact is reported by). */
function mainEffect(variant: Variant, impact?: string) {
  const effects = variant.effects ?? []
  return (
    effects.find((effect) => effect.impact === impact) ??
    [...effects].sort(
      (a, b) => IMPACT_ORDER.indexOf(a.impact) - IMPACT_ORDER.indexOf(b.impact)
    )[0]
  )
}

/**
 * Summary of the last variant search, above the plot (28px). On phones it
 * wraps to two lines and leaves the searched locus out.
 */
export function VariantResultsBanner() {
  const plotted = usePlottedMatches()
  const accessionCount = usePlotStore(
    (state) => state.orderedAccessions?.length ?? 0
  )
  const tableOpen = useUiStore((state) => state.variantTableOpen)
  const setTableOpen = useUiStore((state) => state.setVariantTableOpen)
  if (!plotted) {
    return null
  }
  const { matches, rows } = plotted
  const total = matches.total ?? matches.count
  const bins = new Set(rows.map((row) => row.bin)).size
  const what = `${total.toLocaleString("en-US")} ${matches.filter ? `${matches.filter}-impact ` : ""}variant${total === 1 ? "" : "s"}`
  const searched =
    matches.region && /:\d+-\d+$/.test(matches.region)
      ? (() => {
          const [chromosome, range] = matches.region.split(":")
          const [start, end] = range.split("-").map(Number)
          return formatLocus(chromosome, start, end)
        })()
      : matches.region

  return (
    <div
      className="flex min-h-7 shrink-0 items-center gap-x-2.5 gap-y-1 border-b px-2.5 max-sm:flex-wrap max-sm:py-1.5"
      style={{
        background: "color-mix(in oklch, var(--viz-variant) 12%, var(--card))",
      }}
      role="status"
    >
      <span className="size-[9px] shrink-0 rounded-[2px] bg-(--viz-variant)" />
      <span className="min-w-0 truncate max-sm:basis-[calc(100%-1.25rem)] max-sm:whitespace-normal">
        <b className="font-semibold">{what}</b> in{" "}
        <span className="font-mono">{bins.toLocaleString("en-US")}</span> bin
        {bins === 1 ? "" : "s"} across{" "}
        <span className="font-mono">{matches.totalAccessions.length}</span> of{" "}
        <span className="font-mono">{accessionCount}</span> accessions
      </span>
      <span className="truncate font-mono text-t11 text-muted-foreground max-sm:hidden">
        {searched}
      </span>
      <div className="ml-auto flex shrink-0 gap-1.5">
        {rows.length > 0 && (
          <Button
            variant="outline"
            size="xs"
            onClick={() => setTableOpen(!tableOpen)}
          >
            <Table2Icon />
            {tableOpen ? "Hide results" : "Show results"}
          </Button>
        )}
        <Button variant="outline" size="xs" onClick={clearVariantResults}>
          <EraserIcon />
          Clear
        </Button>
      </div>
    </div>
  )
}

const COLUMNS =
  "grid grid-cols-[110px_80px_150px_minmax(0,1.5fr)_90px_minmax(0,1fr)]"

function TableHeader({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        COLUMNS,
        "h-(--c22) shrink-0 items-center border-b bg-muted font-semibold whitespace-nowrap",
        className
      )}
    >
      <span className="px-2 text-right">Position</span>
      <span className="px-1.5">Ref / Alt</span>
      <span className="px-1.5">Gene</span>
      <span className="px-1.5">Effect</span>
      <span className="px-1.5">Impact</span>
      <span className="px-1.5">Accessions</span>
    </div>
  )
}

function TableRows({
  plotted,
  onPick,
}: {
  plotted: NonNullable<ReturnType<typeof usePlottedMatches>>
  /** Called with the bin of the row that was chosen. */
  onPick: (bin: number) => void
}) {
  const { matches, rows } = plotted
  return rows.map(({ variant, bin }) => {
    const effect = mainEffect(variant, matches.filter || undefined)
    return (
      <button
        key={`${variant.chr}:${variant.pos.start}:${variant.ref}:${variant.alt}`}
        type="button"
        className={cn(
          COLUMNS,
          "h-(--row) w-full items-center border-b border-border/60 text-left hover:bg-accent"
        )}
        onClick={() => onPick(bin)}
      >
        <span className="px-2 text-right font-mono">
          {formatPosition(variant.pos.start)}
        </span>
        <span className="truncate px-1.5 font-mono">
          {variant.ref} / {variant.alt}
        </span>
        <span className="truncate px-1.5 font-mono">{effect?.gene ?? ""}</span>
        <span className="truncate px-1.5">
          {effect?.effect.replaceAll("_", " ").replaceAll("&", ", ") ?? ""}
        </span>
        <span className="px-1.5">
          {effect && (
            <span
              className={cn(
                "rounded-[3px] px-1.5 py-px font-mono text-t10 font-medium",
                effect.impact === "HIGH"
                  ? "bg-destructive/15 text-destructive"
                  : "bg-secondary text-secondary-foreground"
              )}
            >
              {effect.impact}
            </span>
          )}
        </span>
        <span className="px-1.5 font-mono">{variant.accessions.length}</span>
      </button>
    )
  })
}

/**
 * Per-variant results: docked under the plot (168px) on desktop, a bottom
 * sheet of up to 72% of the height on touch layouts.
 */
export function VariantResultsTable() {
  const plotted = usePlottedMatches()
  const open = useUiStore((state) => state.variantTableOpen)
  const setOpen = useUiStore((state) => state.setVariantTableOpen)
  const setPlotPosition = usePlotStore((state) => state.setPlotPosition)
  const touch = useIsTouchLayout()
  if (!plotted) {
    return null
  }
  // Bring the variant's bin into view, a little in from the edge.
  const panTo = (bin: number) =>
    setPlotPosition({ x: Math.min(0, 10 - bin), y: 0 })

  if (touch) {
    return (
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent className="max-h-[72dvh] px-0 pb-[env(safe-area-inset-bottom)]">
          <DrawerTitle className="px-4 pb-2.5">Variant results</DrawerTitle>
          {/* Scrolls both ways inside its own frame, never the page. */}
          <div className="min-h-0 flex-1 overflow-auto border-t text-t11">
            <div className="min-w-[640px]">
              <TableHeader className="sticky top-0 z-10" />
              <TableRows
                plotted={plotted}
                onPick={(bin) => {
                  panTo(bin)
                  setOpen(false)
                }}
              />
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    )
  }
  if (!open) {
    return null
  }
  return (
    <div className="flex h-[168px] shrink-0 flex-col border-t bg-card text-t11">
      <TableHeader />
      <div className="min-h-0 flex-1 overflow-auto">
        <TableRows plotted={plotted} onPick={panTo} />
      </div>
    </div>
  )
}

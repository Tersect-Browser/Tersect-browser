import { EraserIcon, Table2Icon } from "lucide-react"
import { useMemo } from "react"

import { Button } from "@/components/ui/button"
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

/** Summary of the last variant search, above the plot (28px). */
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
      className="flex h-7 shrink-0 items-center gap-2.5 border-b px-2.5"
      style={{
        background: "color-mix(in oklch, var(--viz-variant) 12%, var(--card))",
      }}
      role="status"
    >
      <span className="size-[9px] shrink-0 rounded-[2px] bg-(--viz-variant)" />
      <span className="truncate">
        <b className="font-semibold">{what}</b> in{" "}
        <span className="font-mono">{bins.toLocaleString("en-US")}</span> bin
        {bins === 1 ? "" : "s"} across{" "}
        <span className="font-mono">{matches.totalAccessions.length}</span> of{" "}
        <span className="font-mono">{accessionCount}</span> accessions
      </span>
      <span className="truncate font-mono text-[11px] text-muted-foreground">
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

/** Per-variant results, docked under the plot (168px). */
export function VariantResultsTable() {
  const plotted = usePlottedMatches()
  const open = useUiStore((state) => state.variantTableOpen)
  const setPlotPosition = usePlotStore((state) => state.setPlotPosition)
  if (!plotted || !open) {
    return null
  }
  const { matches, rows } = plotted

  return (
    <div className="flex h-[168px] shrink-0 flex-col border-t bg-card text-[11px]">
      <div
        className={cn(
          COLUMNS,
          "h-[22px] shrink-0 items-center border-b bg-muted font-semibold"
        )}
      >
        <span className="px-2 text-right">Position</span>
        <span className="px-1.5">Ref / Alt</span>
        <span className="px-1.5">Gene</span>
        <span className="px-1.5">Effect</span>
        <span className="px-1.5">Impact</span>
        <span className="px-1.5">Accessions</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {rows.map(({ variant, bin }) => {
          const effect = mainEffect(variant, matches.filter || undefined)
          return (
            <button
              key={`${variant.chr}:${variant.pos.start}:${variant.ref}:${variant.alt}`}
              type="button"
              className={cn(
                COLUMNS,
                "h-5 w-full items-center border-b border-border/60 text-left hover:bg-accent"
              )}
              // Bring the variant's bin into view, a little in from the edge.
              onClick={() =>
                setPlotPosition({ x: Math.min(0, 10 - bin), y: 0 })
              }
            >
              <span className="px-2 text-right font-mono">
                {formatPosition(variant.pos.start)}
              </span>
              <span className="truncate px-1.5 font-mono">
                {variant.ref} / {variant.alt}
              </span>
              <span className="truncate px-1.5 font-mono">
                {effect?.gene ?? ""}
              </span>
              <span className="truncate px-1.5">
                {effect?.effect.replaceAll("_", " ").replaceAll("&", ", ") ??
                  ""}
              </span>
              <span className="px-1.5">
                {effect && (
                  <span
                    className={cn(
                      "rounded-[3px] px-1.5 py-px font-mono text-[10px] font-medium",
                      effect.impact === "HIGH"
                        ? "bg-destructive/15 text-destructive"
                        : "bg-secondary text-secondary-foreground"
                    )}
                  >
                    {effect.impact}
                  </span>
                )}
              </span>
              <span className="px-1.5 font-mono">
                {variant.accessions.length}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

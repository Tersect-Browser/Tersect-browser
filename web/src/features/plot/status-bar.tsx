import { formatMbpRange } from "@/lib/format"
import { cn } from "@/lib/utils"
import { usePlotStore } from "@/store/plot-store"

const RAMP = [0, 1, 2, 3, 4]
  .map((stop) => `var(--viz-heat-grey-${stop})`)
  .join(", ")

/** Legend for the heatmap, and a summary of what is plotted. */
export function StatusBar() {
  const distanceBins = usePlotStore((state) => state.distanceBins)
  const accessionCount = usePlotStore(
    (state) => state.orderedAccessions?.length ?? 0
  )
  const hasVariants = usePlotStore((state) => state.variantMatches !== null)
  const query = distanceBins?.query
  const binCount = distanceBins
    ? (Object.values(distanceBins.bins)[0]?.length ?? 0)
    : 0

  return (
    <footer className="@container flex h-6 shrink-0 items-center gap-4 overflow-hidden border-t bg-card px-2.5 text-t11 whitespace-nowrap text-muted-foreground max-sm:gap-3">
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="font-medium text-foreground max-sm:hidden">
          Distance to reference
        </span>
        <span className="font-mono">0</span>
        <span
          className="h-[9px] w-[110px] min-w-10 shrink rounded-[2px] border"
          style={{ background: `linear-gradient(to right, ${RAMP})` }}
        />
        <span className="font-mono">max in bin</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="size-[9px] shrink-0 rounded-[2px] border bg-(--viz-gap)" />
        <span>Gap in reference</span>
      </div>
      {hasVariants && (
        <div className="flex items-center gap-1.5">
          <span className="size-[9px] shrink-0 rounded-[2px] bg-(--viz-variant)" />
          <span>Variant match</span>
        </div>
      )}
      {/* The legend always stays. When the bar is too narrow the interval is
          dropped first, then the accession × bin count. */}
      {query && (
        <div className="ml-auto flex items-center gap-4 font-mono">
          <span
            className={cn(
              "hidden",
              hasVariants ? "@[840px]:inline" : "@[730px]:inline"
            )}
          >
            {accessionCount} accessions × {binCount.toLocaleString("en-US")}{" "}
            bins
          </span>
          <span
            className={cn(
              "hidden",
              hasVariants ? "@[1000px]:inline" : "@[890px]:inline"
            )}
          >
            {formatMbpRange(query.interval[0], query.interval[1])}
          </span>
        </div>
      )}
    </footer>
  )
}

import { formatMbpRange } from "@/lib/format"
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
  const query = distanceBins?.query
  const binCount = distanceBins
    ? (Object.values(distanceBins.bins)[0]?.length ?? 0)
    : 0

  return (
    <footer className="flex h-6 shrink-0 items-center gap-4 border-t bg-card px-2.5 text-[11px] text-muted-foreground">
      <div className="flex items-center gap-1.5">
        <span>Distance to reference</span>
        <span className="font-mono">0</span>
        <span
          className="h-[9px] w-[110px] rounded-[2px] border"
          style={{ background: `linear-gradient(to right, ${RAMP})` }}
        />
        <span className="font-mono">max in bin</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="size-[9px] rounded-[2px] border bg-(--viz-gap)" />
        <span>Gap in reference</span>
      </div>
      {query && (
        <div className="ml-auto flex items-center gap-4 font-mono">
          <span>
            {accessionCount} accessions × {binCount.toLocaleString("en-US")}{" "}
            bins
          </span>
          <span>{formatMbpRange(query.interval[0], query.interval[1])}</span>
        </div>
      )}
    </footer>
  )
}

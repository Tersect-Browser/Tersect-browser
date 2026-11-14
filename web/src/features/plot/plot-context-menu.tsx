import {
  ArrowLeftToLineIcon,
  ArrowRightToLineIcon,
  BarcodeIcon,
  BinocularsIcon,
  MoveHorizontalIcon,
  SearchIcon,
  StarIcon,
  WaypointsIcon,
  XIcon,
} from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { formatPosition, formatRange } from "@/lib/format"
import type { PlotTarget } from "@/lib/types"
import { usePlotStore } from "@/store/plot-store"
import { useUiStore } from "@/store/ui-store"

function AccessionItems({
  target,
}: {
  target: Extract<PlotTarget, { type: "accession" | "bin" }>
}) {
  const setReference = usePlotStore((state) => state.setReference)
  const removeAccession = usePlotStore((state) => state.removeAccession)
  const setGenomeDialogTarget = useUiStore(
    (state) => state.setGenomeDialogTarget
  )
  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel className="truncate font-mono text-[11px] text-muted-foreground">
        {target.accessionLabel}
      </DropdownMenuLabel>
      <DropdownMenuItem onSelect={() => setReference(target.accession)}>
        <StarIcon />
        Set as reference
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => removeAccession(target.accession)}>
        <XIcon />
        Remove from plot
      </DropdownMenuItem>
      <DropdownMenuItem
        onSelect={() =>
          setGenomeDialogTarget({
            accession: target.accession,
            accessionName: target.accessionLabel,
            interval:
              target.type === "bin"
                ? [target.startPosition, target.endPosition]
                : undefined,
          })
        }
      >
        <BinocularsIcon />
        View in genome browser
      </DropdownMenuItem>
    </DropdownMenuGroup>
  )
}

function IntervalEdgeItems({ start, end }: { start: number; end: number }) {
  const setInterval = usePlotStore((state) => state.setInterval)
  const withInterval = (
    update: (current: [number, number]) => [number, number]
  ) => {
    const current = usePlotStore.getState().interval
    if (current) {
      setInterval(update(current))
    }
  }
  return (
    <>
      <DropdownMenuItem
        onSelect={() => withInterval((current) => [start, current[1]])}
      >
        <ArrowLeftToLineIcon />
        Set as interval start
      </DropdownMenuItem>
      <DropdownMenuItem
        onSelect={() => withInterval((current) => [current[0], end])}
      >
        <ArrowRightToLineIcon />
        Set as interval end
      </DropdownMenuItem>
    </>
  )
}

/** Menu opened by clicking the plot; its contents depend on what was clicked. */
export function PlotContextMenu() {
  const menu = useUiStore((state) => state.contextMenu)
  const setContextMenu = useUiStore((state) => state.setContextMenu)
  const openVariantSearch = useUiStore((state) => state.openVariantSearch)
  const setBarcodeTarget = useUiStore((state) => state.setBarcodeTarget)
  const setIntrogressionTarget = useUiStore(
    (state) => state.setIntrogressionTarget
  )
  const setInterval = usePlotStore((state) => state.setInterval)
  const setHighlight = usePlotStore((state) => state.setHighlight)

  const target = menu?.target

  return (
    <DropdownMenu
      open={menu !== null}
      modal={false}
      onOpenChange={(open) => {
        if (!open) {
          setContextMenu(null)
          // A ruler selection only lives as long as its menu.
          setHighlight(undefined)
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <span
          aria-hidden
          className="pointer-events-none fixed size-0"
          style={{ left: menu?.x ?? 0, top: menu?.y ?? 0 }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[218px]">
        {(target?.type === "accession" || target?.type === "bin") && (
          <AccessionItems target={target} />
        )}

        {target?.type === "bin" && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel className="font-mono text-[11px] text-muted-foreground">
                {formatRange(target.startPosition, target.endPosition)}
              </DropdownMenuLabel>
              <IntervalEdgeItems
                start={target.startPosition}
                end={target.endPosition}
              />
              <DropdownMenuItem
                onSelect={() =>
                  openVariantSearch([target.startPosition, target.endPosition])
                }
              >
                <SearchIcon />
                Search for variants
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  const chromosome = usePlotStore.getState().chromosome
                  if (chromosome) {
                    setBarcodeTarget({
                      accessionName: target.accessionLabel,
                      chromosome: chromosome.name,
                      start: target.startPosition,
                      end: target.endPosition,
                    })
                  }
                }}
              >
                <BarcodeIcon />
                Create barcode
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </>
        )}

        {target?.type === "position" && (
          <DropdownMenuGroup>
            <DropdownMenuLabel className="font-mono text-[11px] text-muted-foreground">
              {formatPosition(target.position)}
            </DropdownMenuLabel>
            <IntervalEdgeItems start={target.position} end={target.position} />
          </DropdownMenuGroup>
        )}

        {target?.type === "interval" && (
          <DropdownMenuGroup>
            <DropdownMenuLabel className="font-mono text-[11px] text-muted-foreground">
              {formatRange(target.startPosition, target.endPosition)}
            </DropdownMenuLabel>
            <DropdownMenuItem
              onSelect={() =>
                setInterval([target.startPosition, target.endPosition])
              }
            >
              <MoveHorizontalIcon />
              Set as interval
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() =>
                openVariantSearch([target.startPosition, target.endPosition])
              }
            >
              <SearchIcon />
              Search for variants
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                const chromosome = usePlotStore.getState().chromosome
                if (chromosome) {
                  setIntrogressionTarget({
                    chromosome: chromosome.name,
                    interval: [target.startPosition, target.endPosition],
                  })
                  setInterval([target.startPosition, target.endPosition])
                }
              }}
            >
              <WaypointsIcon />
              Search for introgressions
            </DropdownMenuItem>
          </DropdownMenuGroup>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

import {
  ArrowLeftToLineIcon,
  ArrowRightToLineIcon,
  BarcodeIcon,
  EyeOffIcon,
  GitMergeIcon,
  LocateFixedIcon,
  MoveHorizontalIcon,
  SearchIcon,
  ScanSearchIcon,
} from "lucide-react"

import { Dialog as DialogPrimitive } from "radix-ui"
import { createContext, useContext, type ReactNode } from "react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup as MenuGroupPrimitive,
  DropdownMenuItem as MenuItemPrimitive,
  DropdownMenuLabel as MenuLabelPrimitive,
  DropdownMenuSeparator as MenuSeparatorPrimitive,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useIsTouchLayout } from "@/hooks/use-breakpoint"
import { formatPosition, formatRange } from "@/lib/format"
import type { PlotTarget } from "@/lib/types"
import { usePlotStore } from "@/store/plot-store"
import { useUiStore } from "@/store/ui-store"
import { cn } from "@/lib/utils"

/**
 * On touch layouts the menu is an action sheet (HANDOFF-mobile 1.3) with the
 * same header and items. Set to the sheet's close function there; null in the
 * desktop dropdown.
 */
const SheetContext = createContext<(() => void) | null>(null)

function DropdownMenuGroup({ children }: { children: ReactNode }) {
  const sheet = useContext(SheetContext)
  return sheet ? (
    <div role="group">{children}</div>
  ) : (
    <MenuGroupPrimitive>{children}</MenuGroupPrimitive>
  )
}

function DropdownMenuLabel({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) {
  const sheet = useContext(SheetContext)
  return sheet ? (
    <div className={cn("truncate px-2 pt-1.5 pb-1 font-medium", className)}>
      {children}
    </div>
  ) : (
    <MenuLabelPrimitive className={className}>{children}</MenuLabelPrimitive>
  )
}

function DropdownMenuSeparator() {
  const sheet = useContext(SheetContext)
  return sheet ? (
    <div role="separator" className="-mx-1 my-1 h-px bg-border" />
  ) : (
    <MenuSeparatorPrimitive />
  )
}

function DropdownMenuItem({
  onSelect,
  children,
}: {
  onSelect: () => void
  children: ReactNode
}) {
  const closeSheet = useContext(SheetContext)
  return closeSheet ? (
    <button
      type="button"
      className="flex h-(--c24) w-full items-center gap-2 rounded-md px-2 text-left whitespace-nowrap outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent active:bg-accent [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground"
      onClick={() => {
        onSelect()
        closeSheet()
      }}
    >
      {children}
    </button>
  ) : (
    <MenuItemPrimitive onSelect={onSelect}>{children}</MenuItemPrimitive>
  )
}

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
      <DropdownMenuLabel className="truncate font-mono text-t11 text-muted-foreground">
        {target.accessionLabel}
      </DropdownMenuLabel>
      <DropdownMenuItem onSelect={() => setReference(target.accession)}>
        <LocateFixedIcon />
        Set as reference
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => removeAccession(target.accession)}>
        <EyeOffIcon />
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
        <ScanSearchIcon />
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

  const isTouchLayout = useIsTouchLayout()
  const target = menu?.target

  const close = () => {
    setContextMenu(null)
    // A ruler selection only lives as long as its menu.
    setHighlight(undefined)
  }

  const items = (
    <>
      {(target?.type === "accession" || target?.type === "bin") && (
        <AccessionItems target={target} />
      )}

      {target?.type === "bin" && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel className="font-mono text-t11 text-muted-foreground">
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
                    accession: target.accession,
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
          <DropdownMenuLabel className="font-mono text-t11 text-muted-foreground">
            {formatPosition(target.position)}
          </DropdownMenuLabel>
          <IntervalEdgeItems start={target.position} end={target.position} />
        </DropdownMenuGroup>
      )}

      {target?.type === "interval" && (
        <DropdownMenuGroup>
          <DropdownMenuLabel className="font-mono text-t11 text-muted-foreground">
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
            <GitMergeIcon />
            Search for introgressions
          </DropdownMenuItem>
        </DropdownMenuGroup>
      )}
    </>
  )

  if (isTouchLayout) {
    return (
      <DialogPrimitive.Root
        open={menu !== null}
        onOpenChange={(open) => !open && close()}
      >
        <DialogPrimitive.Portal>
          {/* No scrim: the plot stays visible; a tap outside closes. */}
          <DialogPrimitive.Overlay className="fixed inset-0 z-50" />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            className="fixed inset-x-2 bottom-[calc(8px+env(safe-area-inset-bottom))] z-50 max-h-[calc(100dvh-var(--topbar)-16px)] overflow-y-auto rounded-xl border bg-popover p-1 text-xs text-popover-foreground shadow-[0_8px_24px_rgb(0_0_0/0.22)] outline-none data-open:animate-in data-open:fade-in-0 data-open:slide-in-from-bottom-4"
            // The finger that long-pressed is still down when this opens.
            onOpenAutoFocus={(event) => event.preventDefault()}
          >
            <DialogPrimitive.Title className="sr-only">
              Plot actions
            </DialogPrimitive.Title>
            <SheetContext.Provider value={close}>{items}</SheetContext.Provider>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    )
  }

  return (
    <DropdownMenu
      open={menu !== null}
      modal={false}
      onOpenChange={(open) => !open && close()}
    >
      <DropdownMenuTrigger asChild>
        <span
          aria-hidden
          className="pointer-events-none fixed size-0"
          style={{ left: menu?.x ?? 0, top: menu?.y ?? 0 }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[218px]">
        {items}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

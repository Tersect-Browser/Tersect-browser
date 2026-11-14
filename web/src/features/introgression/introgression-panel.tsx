import {
  CheckIcon,
  ChevronsUpDownIcon,
  Maximize2Icon,
  Minimize2Icon,
  MinusIcon,
  PanelTopIcon,
  PictureInPicture2Icon,
  XIcon,
} from "lucide-react"
import { useMemo, useRef, useState } from "react"
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Spinner } from "@/components/ui/spinner"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { formatLocus } from "@/lib/format"
import { getAccessionLabel } from "@/lib/genome"
import { cn } from "@/lib/utils"
import { usePlotStore } from "@/store/plot-store"
import { useUiStore, type IntrogressionTarget } from "@/store/ui-store"

import { IntrogressionChart } from "./introgression-chart"
import { useIntrogressionRun } from "./use-introgression-run"

const QUARTET_SIZE = 4
const BLOCK_SIZE_RANGE = [5, 100] as const
const RETICULATIONS_RANGE = [2, 4] as const

interface TaxonOption {
  value: string
  label: string
}

/** Searchable picker for one taxon or, with `limit`, for several. */
function TaxaPicker({
  id,
  options,
  selected,
  placeholder,
  limit,
  invalid,
  onChange,
}: {
  id: string
  options: TaxonOption[]
  selected: string[]
  placeholder: string
  /** Maximum number of taxa; a single-select when 1. */
  limit: number
  invalid?: boolean
  onChange: (selected: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const labels = selected.map(
    (value) => options.find((option) => option.value === value)?.label ?? value
  )
  const toggle = (value: string) => {
    if (limit === 1) {
      onChange(selected.includes(value) ? [] : [value])
      setOpen(false)
    } else if (selected.includes(value)) {
      onChange(selected.filter((other) => other !== value))
    } else if (selected.length < limit) {
      onChange([...selected, value])
    }
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid}
          className="h-auto min-h-8 w-full justify-between font-normal whitespace-normal"
        >
          <span
            className={cn(
              "text-left",
              !labels.length && "text-muted-foreground"
            )}
          >
            {labels.length ? labels.join(", ") : placeholder}
          </span>
          <ChevronsUpDownIcon className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <Command>
          <CommandInput placeholder="Search taxa..." />
          <CommandList>
            <CommandEmpty>No taxon found.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const isSelected = selected.includes(option.value)
                return (
                  <CommandItem
                    key={option.value}
                    value={`${option.label} ${option.value}`}
                    disabled={
                      limit > 1 && !isSelected && selected.length >= limit
                    }
                    onSelect={() => toggle(option.value)}
                  >
                    <span className="truncate">{option.label}</span>
                    {isSelected && <CheckIcon className="ml-auto" />}
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

function FormField({
  id,
  label,
  hint,
  errors,
  children,
}: {
  id: string
  label: string
  hint?: string
  errors?: (string | false)[]
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {children}
      {errors?.map(
        (error) =>
          error && (
            <p key={error} className="text-xs text-destructive">
              {error}
            </p>
          )
      )}
    </div>
  )
}

function WindowButton({
  label,
  children,
  ...props
}: React.ComponentProps<typeof Button> & { label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label} {...props}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function inRange(value: number, [min, max]: readonly [number, number]) {
  return Number.isInteger(value) && value >= min && value <= max
}

function IntrogressionWindow({ target }: { target: IntrogressionTarget }) {
  const close = useUiStore((state) => state.setIntrogressionTarget)
  const accessions = usePlotStore((state) => state.accessions)
  const accessionDictionary = usePlotStore((state) => state.accessionDictionary)
  const reference = usePlotStore((state) => state.reference)
  const run = useIntrogressionRun()

  /* ------------------------------------------------------ window state -- */
  const [floating, setFloating] = useState(true)
  const [minimized, setMinimized] = useState(false)
  const [maximized, setMaximized] = useState(false)
  const [position, setPosition] = useState({ x: 24, y: 16 })
  const drag = useRef<{ dx: number; dy: number } | null>(null)

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (
      !floating ||
      maximized ||
      (event.target as HTMLElement).closest("button")
    ) {
      return
    }
    drag.current = {
      dx: event.clientX - position.x,
      dy: event.clientY - position.y,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current) {
      setPosition({
        x: Math.max(0, event.clientX - drag.current.dx),
        y: Math.max(0, event.clientY - drag.current.dy),
      })
    }
  }

  /* --------------------------------------------------------------- form -- */
  const [outgroup, setOutgroup] = useState<string | null>(reference ?? null)
  const [quartet, setQuartet] = useState<string[]>(reference ? [reference] : [])
  const [blockSize, setBlockSize] = useState("50")
  const [maxReticulations, setMaxReticulations] = useState("2")
  const [submitted, setSubmitted] = useState(false)

  const options = useMemo<TaxonOption[]>(
    () =>
      (accessions ?? []).map((accession) => ({
        value: accession,
        label: getAccessionLabel(accessionDictionary, accession),
      })),
    [accessions, accessionDictionary]
  )

  const chooseOutgroup = (value: string | null) => {
    setOutgroup(value)
    if (value && !quartet.includes(value)) {
      // The quartet must contain the outgroup.
      setQuartet([value, ...quartet].slice(0, QUARTET_SIZE))
    }
  }

  const blockSizeValue = Number(blockSize)
  const reticulationsValue = Number(maxReticulations)
  const errors = {
    outgroup: !outgroup,
    quartetSize: quartet.length !== QUARTET_SIZE,
    quartetOutgroup: Boolean(outgroup) && !quartet.includes(outgroup ?? ""),
    blockSize: !inRange(blockSizeValue, BLOCK_SIZE_RANGE),
    maxReticulations: !inRange(reticulationsValue, RETICULATIONS_RANGE),
  }
  const invalid = Object.values(errors).some(Boolean)
  const busy = run.loading || run.phylonetLoading

  const submit = () => {
    setSubmitted(true)
    const { datasetId, accessions: wholeAccessions } = usePlotStore.getState()
    if (invalid || !outgroup || !datasetId || !wholeAccessions) {
      return
    }
    void run.start({
      datasetId,
      chromosome: target.chromosome,
      interval: target.interval,
      accessions: quartet,
      wholeAccessions,
      outgroup,
      blockSize: blockSizeValue,
      maxReticulations: reticulationsValue,
    })
  }

  const hasResults = run.scan !== null || run.phylonet !== null

  return (
    <section
      aria-label="Introgression analysis"
      className={cn(
        "flex flex-col overflow-hidden border bg-card text-card-foreground",
        maximized
          ? "fixed inset-0 z-40"
          : floating
            ? "fixed z-30 rounded-xl shadow-xl"
            : "relative shrink-0 border-x-0",
        !maximized && !minimized && (floating ? "resize" : "resize-y")
      )}
      style={
        maximized
          ? undefined
          : floating
            ? {
                left: position.x,
                top: position.y,
                width: "min(95vw, 1600px)",
                height: minimized ? undefined : "75vh",
              }
            : { height: minimized ? undefined : "50vh" }
      }
    >
      <header
        className={cn(
          "flex shrink-0 items-center gap-1 border-b px-3 py-1.5",
          floating && !maximized && "cursor-move"
        )}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={() => (drag.current = null)}
      >
        <h2 className="text-sm font-semibold">Introgression analysis</h2>
        <span className="font-mono text-xs text-muted-foreground">
          {formatLocus(
            target.chromosome,
            target.interval[0],
            target.interval[1]
          )}
        </span>
        <span className="flex-1" />
        <WindowButton
          label={minimized ? "Expand" : "Minimize"}
          disabled={maximized}
          onClick={() => setMinimized(!minimized)}
        >
          <MinusIcon />
        </WindowButton>
        <WindowButton
          label={floating ? "Dock" : "Float"}
          disabled={maximized}
          onClick={() => setFloating(!floating)}
        >
          {floating ? <PanelTopIcon /> : <PictureInPicture2Icon />}
        </WindowButton>
        <WindowButton
          label={maximized ? "Restore" : "Maximize"}
          onClick={() => {
            setMaximized(!maximized)
            setMinimized(false)
          }}
        >
          {maximized ? <Minimize2Icon /> : <Maximize2Icon />}
        </WindowButton>
        <WindowButton label="Close" onClick={() => close(null)}>
          <XIcon />
        </WindowButton>
      </header>

      {!minimized && (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(16rem,1fr)_3fr]">
          <form
            className="flex flex-col gap-4 overflow-auto border-r p-4"
            onSubmit={(event) => {
              event.preventDefault()
              submit()
            }}
          >
            <FormField
              id="introgression-outgroup"
              label="Choose outgroup"
              errors={[submitted && errors.outgroup && "Outgroup is required."]}
            >
              <TaxaPicker
                id="introgression-outgroup"
                options={options}
                selected={outgroup ? [outgroup] : []}
                placeholder="Select an outgroup"
                limit={1}
                invalid={submitted && errors.outgroup}
                onChange={([value]) => chooseOutgroup(value ?? null)}
              />
            </FormField>

            <FormField
              id="introgression-quartet"
              label="Choose 4 taxa (must include outgroup)"
              hint="Quartet for window scan analysis"
              errors={[
                submitted &&
                  errors.quartetOutgroup &&
                  "Quartet must include the selected outgroup.",
                submitted &&
                  errors.quartetSize &&
                  "Please select exactly 4 taxa.",
              ]}
            >
              <TaxaPicker
                id="introgression-quartet"
                options={options}
                selected={quartet}
                placeholder="Select exactly 4 taxa including the outgroup"
                limit={QUARTET_SIZE}
                invalid={
                  submitted && (errors.quartetOutgroup || errors.quartetSize)
                }
                onChange={setQuartet}
              />
            </FormField>

            <FormField
              id="introgression-block-size"
              label="Block size"
              hint="Amount of gene trees per block"
              errors={[
                submitted &&
                  errors.blockSize &&
                  "Block size is required (5-100).",
              ]}
            >
              <Input
                id="introgression-block-size"
                type="number"
                min={BLOCK_SIZE_RANGE[0]}
                max={BLOCK_SIZE_RANGE[1]}
                className="w-32 font-mono"
                value={blockSize}
                aria-invalid={submitted && errors.blockSize}
                onChange={(event) => setBlockSize(event.target.value)}
              />
            </FormField>

            <FormField
              id="introgression-reticulations"
              label="Max reticulations"
              hint="Maximum number of reticulations to be used in PhyloNet"
              errors={[
                submitted &&
                  errors.maxReticulations &&
                  "Max reticulations is required (2-4).",
              ]}
            >
              <Input
                id="introgression-reticulations"
                type="number"
                min={RETICULATIONS_RANGE[0]}
                max={RETICULATIONS_RANGE[1]}
                className="w-32 font-mono"
                value={maxReticulations}
                aria-invalid={submitted && errors.maxReticulations}
                onChange={(event) => setMaxReticulations(event.target.value)}
              />
            </FormField>

            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={busy}>
                {busy && <Spinner />}
                Run analysis
              </Button>
              <Button type="button" variant="ghost" onClick={() => close(null)}>
                Cancel
              </Button>
              {!busy && (hasResults || run.error) && (
                <Button type="button" variant="ghost" onClick={run.clear}>
                  Clear results
                </Button>
              )}
            </div>
          </form>

          <div className="flex min-w-0 flex-col gap-4 overflow-auto p-4">
            {run.error && (
              <Alert variant="destructive">
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{run.error}</AlertDescription>
              </Alert>
            )}

            {run.loading && (
              <div
                className="flex flex-1 flex-col items-center justify-center gap-2 text-sm"
                role="status"
              >
                <Spinner className="size-8" />
                <p>Running analysis...</p>
                <p className="text-muted-foreground">{run.status}</p>
              </div>
            )}

            {!run.loading && !run.error && !hasResults && !busy && (
              <p className="text-sm text-muted-foreground italic">
                Results will appear here after you run the analysis.
              </p>
            )}

            {run.scan && (
              <>
                <h3 className="text-base font-semibold">Results</h3>
                <ul className="flex flex-wrap gap-5 text-xs">
                  {[
                    ["--chart-topology-1", "T1 - Species tree topology"],
                    ["--chart-topology-2", "T2 - Discordant topology 1"],
                    ["--chart-topology-3", "T3 - Discordant topology 2"],
                  ].map(([token, label]) => (
                    <li key={token} className="flex items-center gap-1.5">
                      <span
                        className="inline-block size-3.5 rounded-xs"
                        style={{ background: `var(${token})` }}
                      />
                      {label}
                    </li>
                  ))}
                </ul>
                <IntrogressionChart data={run.scan} />
              </>
            )}

            {!run.loading && run.phylonetLoading && (
              <div className="flex items-center gap-2 text-sm" role="status">
                <Spinner />
                <span>Running PhyloNet analysis...</span>
                <span className="text-muted-foreground">{run.status}</span>
              </div>
            )}

            {run.phylonet && (
              <div className="flex flex-col gap-3">
                {run.phylonet.phyloText && (
                  <a
                    className="text-sm text-primary underline underline-offset-4"
                    href={run.phylonet.phyloText}
                    target="_blank"
                    rel="noreferrer"
                    download
                  >
                    Download PhyloNet output
                  </a>
                )}
                {run.phylonet.phyloPlot && (
                  <figure className="flex flex-col gap-1">
                    <figcaption className="text-sm font-medium">
                      PhyloNet plot
                    </figcaption>
                    <img
                      src={run.phylonet.phyloPlot}
                      alt="PhyloNet plot"
                      className="max-w-[800px] rounded-md border bg-white"
                    />
                  </figure>
                )}
                {run.phylonet.phyloIntroPlot && (
                  <figure className="flex flex-col gap-1">
                    <figcaption className="text-sm font-medium">
                      PhyloNet network
                    </figcaption>
                    <img
                      src={run.phylonet.phyloIntroPlot}
                      alt="PhyloNet network with hybridization events"
                      className="max-w-[800px] rounded-md border bg-white"
                    />
                  </figure>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

/**
 * Window for running an introgression analysis on a region. It can float over
 * the plot, dock above it, be minimised to its title bar or maximised.
 */
export function IntrogressionPanel() {
  const target = useUiStore((state) => state.introgressionTarget)
  if (!target) {
    return null
  }
  return (
    <IntrogressionWindow
      key={`${target.chromosome}:${target.interval.join("-")}`}
      target={target}
    />
  )
}

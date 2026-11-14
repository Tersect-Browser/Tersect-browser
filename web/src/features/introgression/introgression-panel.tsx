import {
  ChartColumnIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronsUpDownIcon,
  CircleAlertIcon,
  FileDownIcon,
  GitMergeIcon,
  Maximize2Icon,
  Minimize2Icon,
  MinusIcon,
  PanelTopIcon,
  PictureInPicture2Icon,
  XIcon,
} from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
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
import { JobStepper } from "./job-stepper"
import { JOB_STAGES } from "./types"
import { useIntrogressionRun } from "./use-introgression-run"

const QUARTET_SIZE = 4
const BLOCK_SIZE_RANGE = [5, 100] as const
const RETICULATIONS_RANGE = [2, 4] as const

type PanelMode = "docked" | "minimised" | "floating" | "maximised"

/** Docked height and floating geometry (9.1). */
const DOCKED_HEIGHT = 384
const HEADER_HEIGHT = 29
const MIN_FLOAT_WIDTH = 520

/** Floating position and size, kept for the session. */
const floating = { x: 220, y: 60, width: 880, height: 470 }

interface TaxonOption {
  value: string
  label: string
}

/** Searchable single picker, or multi-select with chips when limit > 1. */
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
  limit: number
  invalid?: boolean
  onChange: (selected: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const labelOf = (value: string) =>
    options.find((option) => option.value === value)?.label ?? value
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
        {limit === 1 ? (
          <Button
            id={id}
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-invalid={invalid}
            className="w-full justify-between bg-background px-[7px] font-mono font-normal"
          >
            <span
              className={cn(
                "truncate",
                !selected.length && "font-sans text-muted-foreground"
              )}
            >
              {selected.length ? labelOf(selected[0]) : placeholder}
            </span>
            <ChevronsUpDownIcon className="size-3 text-muted-foreground" />
          </Button>
        ) : (
          <div
            id={id}
            role="combobox"
            tabIndex={0}
            aria-expanded={open}
            aria-invalid={invalid}
            className={cn(
              "flex min-h-(--control) w-full cursor-pointer flex-wrap items-center gap-[3px] rounded-lg border bg-background p-[3px] outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30",
              invalid ? "border-destructive" : "border-input"
            )}
          >
            {selected.length === 0 && (
              <span className="px-1 text-muted-foreground">{placeholder}</span>
            )}
            {selected.map((value) => (
              <span
                key={value}
                className="inline-flex h-[18px] items-center gap-1 rounded-[3px] bg-secondary pr-1 pl-1.5 font-mono text-[11px] whitespace-nowrap text-secondary-foreground"
              >
                {labelOf(value)}
                <button
                  type="button"
                  aria-label={`Remove ${labelOf(value)}`}
                  className="text-muted-foreground hover:text-foreground"
                  onClick={(event) => {
                    event.stopPropagation()
                    onChange(selected.filter((other) => other !== value))
                  }}
                >
                  <XIcon className="size-2.5" />
                </button>
              </span>
            ))}
          </div>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <Command>
          <CommandInput placeholder="Filter accessions…" />
          <CommandList>
            <CommandEmpty>No accession found.</CommandEmpty>
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
                    className="font-mono text-[11px]"
                    onSelect={() => toggle(option.value)}
                  >
                    <CheckIcon
                      className={cn("size-3", !isSelected && "opacity-0")}
                    />
                    <span className="truncate">{option.label}</span>
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
  aside,
  hint,
  errors,
  children,
}: {
  id: string
  label: ReactNode
  aside?: ReactNode
  hint?: string
  errors?: (string | false)[]
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-[3px]">
      <Label htmlFor={id} className="justify-between">
        <span>{label}</span>
        {aside}
      </Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      {errors?.map(
        (error) =>
          error && (
            <p
              key={error}
              className="flex items-center gap-1 text-[11px] text-destructive"
            >
              <CircleAlertIcon className="size-3" />
              {error}
            </p>
          )
      )}
    </div>
  )
}

function WindowButton({
  label,
  className,
  children,
  ...props
}: React.ComponentProps<typeof Button> & { label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          aria-label={label}
          className={cn("size-[22px] rounded-[3px] p-0", className)}
          {...props}
        >
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

/** A server-rendered image (white background) with a skeleton while loading. */
function ServerImage({ src, title }: { src: string; title: string }) {
  const [loaded, setLoaded] = useState(false)
  return (
    <figure className="flex flex-col gap-1">
      <figcaption className="font-medium">{title}</figcaption>
      <div className="relative aspect-[2] overflow-hidden rounded-[4px] border bg-white">
        {!loaded && <div className="absolute inset-0 animate-pulse bg-muted" />}
        <img
          src={src}
          alt={title}
          className="size-full object-contain"
          onLoad={() => setLoaded(true)}
        />
      </div>
    </figure>
  )
}

function IntrogressionWindow({ target }: { target: IntrogressionTarget }) {
  const setTarget = useUiStore((state) => state.setIntrogressionTarget)
  const accessions = usePlotStore((state) => state.accessions)
  const accessionDictionary = usePlotStore((state) => state.accessionDictionary)
  const reference = usePlotStore((state) => state.reference)
  const run = useIntrogressionRun()
  const busy = run.loading || run.phylonetLoading

  /* ------------------------------------------------------ window state -- */
  const [mode, setMode] = useState<PanelMode>("docked")
  const [geometry, setGeometry] = useState(floating)
  const [confirmClose, setConfirmClose] = useState(false)
  const drag = useRef<{ dx: number; dy: number } | null>(null)
  const sectionRef = useRef<HTMLElement>(null)

  const requestClose = () => {
    if (busy) {
      setConfirmClose(true)
    } else {
      setTarget(null)
    }
  }
  // The toolbar's Introgression button asks to close through the store.
  const busyRef = useRef(busy)
  useEffect(() => {
    busyRef.current = busy
  }, [busy])
  useEffect(
    () =>
      useUiStore.subscribe((state, previous) => {
        if (
          state.introgressionCloseRequest !== previous.introgressionCloseRequest
        ) {
          if (busyRef.current) {
            setConfirmClose(true)
          } else {
            setTarget(null)
          }
        }
      }),
    [setTarget]
  )

  // Remember the floating size after a corner resize.
  useEffect(() => {
    const element = sectionRef.current
    if (!element || mode !== "floating") {
      return
    }
    const observer = new ResizeObserver(() => {
      floating.width = element.offsetWidth
      floating.height = element.offsetHeight
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [mode])

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (
      mode !== "floating" ||
      (event.target as HTMLElement).closest("button")
    ) {
      return
    }
    drag.current = {
      dx: event.clientX - geometry.x,
      dy: event.clientY - geometry.y,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current) {
      floating.x = Math.max(0, event.clientX - drag.current.dx)
      floating.y = Math.max(0, event.clientY - drag.current.dy)
      setGeometry({ ...floating })
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
  const quartetInvalid =
    (submitted || quartet.length > QUARTET_SIZE) &&
    (errors.quartetOutgroup || errors.quartetSize)

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
  const started = busy || hasResults || run.error !== null
  const stageName = JOB_STAGES[Math.min(run.stage, JOB_STAGES.length - 1)] ?? ""

  const locus = formatLocus(
    target.chromosome,
    target.interval[0],
    target.interval[1]
  )
  const minimised = mode === "minimised"

  return (
    <section
      ref={sectionRef}
      aria-label="Introgression analysis"
      className={cn(
        "flex flex-col overflow-hidden bg-card text-card-foreground",
        mode === "docked" && "relative shrink-0 border-b",
        mode === "minimised" && "relative shrink-0 border-b",
        mode === "floating" &&
          "absolute z-30 resize rounded-2xl border shadow-[0_16px_48px_rgb(0_0_0/0.3)]",
        mode === "maximised" && "absolute inset-0 z-30"
      )}
      style={
        mode === "docked"
          ? { height: DOCKED_HEIGHT }
          : mode === "minimised"
            ? { height: HEADER_HEIGHT }
            : mode === "floating"
              ? {
                  left: geometry.x,
                  top: geometry.y,
                  width: geometry.width,
                  height: geometry.height,
                  minWidth: MIN_FLOAT_WIDTH,
                  minHeight: HEADER_HEIGHT,
                }
              : undefined
      }
    >
      <header
        className={cn(
          "flex h-7 shrink-0 items-center gap-1.5 border-b bg-muted pr-1 pl-2.5 select-none",
          mode === "floating" && "cursor-move"
        )}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={() => (drag.current = null)}
      >
        <GitMergeIcon className="size-[13px] text-muted-foreground" />
        <h2 className="font-semibold whitespace-nowrap">
          Introgression analysis
        </h2>
        <span className="truncate font-mono text-[11px] text-muted-foreground">
          {locus}
        </span>
        {busy && (
          <span className="flex items-center gap-[5px] font-medium whitespace-nowrap text-primary">
            <Spinner className="size-3" />
            {stageName}
          </span>
        )}
        <span className="flex-1" />
        <WindowButton
          label={minimised ? "Expand" : "Minimise"}
          onClick={() => setMode(minimised ? "docked" : "minimised")}
        >
          {minimised ? <ChevronDownIcon /> : <MinusIcon />}
        </WindowButton>
        <WindowButton
          label={mode === "floating" ? "Dock" : "Float"}
          onClick={() => setMode(mode === "floating" ? "docked" : "floating")}
        >
          {mode === "floating" ? <PanelTopIcon /> : <PictureInPicture2Icon />}
        </WindowButton>
        <WindowButton
          label={mode === "maximised" ? "Restore" : "Maximise"}
          onClick={() => setMode(mode === "maximised" ? "docked" : "maximised")}
        >
          {mode === "maximised" ? <Minimize2Icon /> : <Maximize2Icon />}
        </WindowButton>
        <WindowButton
          label="Close"
          className="hover:bg-destructive hover:text-white"
          onClick={requestClose}
        >
          <XIcon />
        </WindowButton>
      </header>

      {/* Kept mounted when minimised so the form and results survive. */}
      <div
        className={cn(
          "grid min-h-0 flex-1 grid-cols-[minmax(250px,1fr)_minmax(0,3fr)]",
          minimised && "hidden"
        )}
      >
        <form
          className="flex flex-col gap-[9px] overflow-auto border-r px-3 py-2.5"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <FormField
            id="introgression-outgroup"
            label={
              <>
                Choose outgroup <span className="text-destructive">*</span>
              </>
            }
            errors={[
              submitted && errors.outgroup && "An outgroup is required.",
            ]}
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
            aside={
              <span
                className={cn(
                  "font-mono text-[11px] font-medium",
                  quartetInvalid ? "text-destructive" : "text-muted-foreground"
                )}
              >
                {quartet.length}/{QUARTET_SIZE}
              </span>
            }
            hint="Quartet for window scan analysis"
            errors={[
              quartetInvalid &&
                errors.quartetOutgroup &&
                "Quartet must include the selected outgroup.",
              quartetInvalid &&
                errors.quartetSize &&
                "Please select exactly 4 taxa.",
            ]}
          >
            <TaxaPicker
              id="introgression-quartet"
              options={options}
              selected={quartet}
              placeholder="Select 4 accessions"
              limit={QUARTET_SIZE}
              invalid={quartetInvalid}
              onChange={setQuartet}
            />
          </FormField>

          <div className="grid grid-cols-2 gap-2">
            <FormField
              id="introgression-block-size"
              label="Block size"
              hint="Amount of gene trees per block"
              errors={[
                submitted &&
                  errors.blockSize &&
                  `Between ${BLOCK_SIZE_RANGE[0]} and ${BLOCK_SIZE_RANGE[1]}.`,
              ]}
            >
              <Input
                id="introgression-block-size"
                type="number"
                min={BLOCK_SIZE_RANGE[0]}
                max={BLOCK_SIZE_RANGE[1]}
                className="text-right font-mono"
                value={blockSize}
                aria-invalid={submitted && errors.blockSize}
                onChange={(event) => setBlockSize(event.target.value)}
              />
            </FormField>
            <FormField
              id="introgression-reticulations"
              label="Max reticulations"
              hint="Maximum number of reticulations to be used in phylonet"
              errors={[
                submitted &&
                  errors.maxReticulations &&
                  `Between ${RETICULATIONS_RANGE[0]} and ${RETICULATIONS_RANGE[1]}.`,
              ]}
            >
              <Input
                id="introgression-reticulations"
                type="number"
                min={RETICULATIONS_RANGE[0]}
                max={RETICULATIONS_RANGE[1]}
                className="text-right font-mono"
                value={maxReticulations}
                aria-invalid={submitted && errors.maxReticulations}
                onChange={(event) => setMaxReticulations(event.target.value)}
              />
            </FormField>
          </div>

          <div className="mt-0.5 flex flex-wrap gap-[5px]">
            <Button type="submit" disabled={busy || (submitted && invalid)}>
              {busy && <Spinner />}
              {busy ? "Running…" : "Run analysis"}
            </Button>
            <Button
              type="button"
              variant="outline"
              // Stops following a running job, or closes the panel.
              onClick={() => (busy ? run.clear() : setTarget(null))}
            >
              Cancel
            </Button>
            {!busy && (hasResults || run.error) && (
              <Button
                type="button"
                variant="ghost"
                className="text-muted-foreground hover:text-foreground"
                onClick={run.clear}
              >
                Clear results
              </Button>
            )}
          </div>
        </form>

        <div className="flex min-w-0 flex-col gap-2.5 overflow-auto px-3 py-2.5">
          {!started && (
            <div className="flex min-h-[120px] flex-1 flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed text-muted-foreground">
              <ChartColumnIcon className="size-5" />
              Results will appear here after you run the analysis.
            </div>
          )}

          {started && (
            <JobStepper
              stage={run.stage}
              failedStage={run.failedStage}
              status={run.status}
            />
          )}

          {run.error && (
            <div
              role="alert"
              className="flex gap-2 rounded-xl border border-destructive bg-destructive/8 px-2.5 py-2"
            >
              <CircleAlertIcon className="mt-px size-3.5 shrink-0 text-destructive" />
              <div className="flex flex-col gap-0.5">
                <span className="font-semibold text-destructive">
                  Error: the{" "}
                  {JOB_STAGES[run.failedStage ?? run.stage]?.toLowerCase()}{" "}
                  stage failed
                </span>
                <span className="font-mono text-[11px]">{run.error}</span>
              </div>
            </div>
          )}

          {run.loading && !run.scan && (
            <div className="min-h-[100px] flex-1 animate-pulse rounded-xl bg-muted" />
          )}

          {run.scan && (
            <>
              <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1">
                <span className="font-semibold">
                  Triplet scan (B={run.scan.params.block_size})
                </span>
                {(
                  [
                    ["--viz-t1", "T1 species-tree topology"],
                    ["--viz-t2", "T2 discordant topology 1"],
                    ["--viz-t3", "T3 discordant topology 2"],
                  ] as const
                ).map(([token, label]) => (
                  <span key={token} className="flex items-center gap-1">
                    <span
                      className="size-[9px]"
                      style={{ background: `var(${token})` }}
                    />
                    {label}
                  </span>
                ))}
                <span className="flex items-center gap-1">
                  <span className="w-3.5 border-t-[1.5px] border-dashed border-(--viz-expected)" />
                  Expected discordance
                </span>
                <span className="flex items-center gap-1">
                  <span className="text-[10px] text-(--viz-sig)">★</span>
                  Significant block
                </span>
              </div>
              <IntrogressionChart data={run.scan} />
            </>
          )}

          {run.phylonet && (
            <div className="flex flex-col gap-2 border-t pt-2">
              <div className="flex items-center gap-2.5">
                <span className="font-semibold">PhyloNet</span>
                {run.phylonet.phyloText && (
                  <a
                    className="flex items-center gap-1 text-primary hover:underline"
                    href={run.phylonet.phyloText}
                    target="_blank"
                    rel="noreferrer"
                    download
                  >
                    <FileDownIcon className="size-[13px]" />
                    Download PhyloNet output
                  </a>
                )}
              </div>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-2.5">
                {run.phylonet.phyloPlot && (
                  <ServerImage
                    src={run.phylonet.phyloPlot}
                    title="PhyloNet Plot"
                  />
                )}
                {run.phylonet.phyloIntroPlot && (
                  <ServerImage
                    src={run.phylonet.phyloIntroPlot}
                    title="PhyloNet Output"
                  />
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
        <AlertDialogContent className="data-[size=default]:sm:max-w-[360px]">
          <AlertDialogHeader>
            <AlertDialogTitle>Close the analysis?</AlertDialogTitle>
            <AlertDialogDescription>
              An introgression analysis is still running. Closing the panel
              stops following it and its results will not be shown.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep open</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                run.clear()
                setTarget(null)
              }}
            >
              Close
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}

/**
 * Introgression analysis panel (section 9): docked under the toolbar by
 * default; it can be minimised, floated over the plot or maximised.
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

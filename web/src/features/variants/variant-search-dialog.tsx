import { useQuery } from "@tanstack/react-query"
import { CircleAlertIcon, InfoIcon } from "lucide-react"
import { useState } from "react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Spinner } from "@/components/ui/spinner"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { getDatasets } from "@/lib/api"
import { formatPosition, parsePosition } from "@/lib/format"
import { clamp } from "@/lib/genome"
import { cn } from "@/lib/utils"
import { usePlotStore } from "@/store/plot-store"
import { useUiStore } from "@/store/ui-store"

import {
  IMPACT_LEVELS,
  runVariantSearch,
  suggestGenes,
  type ImpactLevel,
} from "./search"

/** Coordinate input: comma-formatted, right-aligned, committed on blur. */
function PositionInput({
  value,
  onChange,
  label,
  invalid,
}: {
  value: number
  onChange: (value: number) => void
  label: string
  invalid?: boolean
}) {
  const [text, setText] = useState<string | null>(null)
  const commit = () => {
    if (text !== null) {
      const parsed = parsePosition(text)
      if (parsed !== null) {
        onChange(parsed)
      }
      setText(null)
    }
  }
  return (
    <Input
      aria-label={label}
      inputMode="numeric"
      aria-invalid={invalid}
      className="min-w-0 flex-1 text-right font-mono"
      value={text ?? formatPosition(value)}
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => event.key === "Enter" && commit()}
    />
  )
}

function GeneInput({
  value,
  onChange,
  disabled,
}: {
  value: string
  onChange: (value: string) => void
  disabled: boolean
}) {
  const datasetId = usePlotStore((state) => state.datasetId)
  const chromosome = usePlotStore((state) => state.chromosome)
  const [focused, setFocused] = useState(false)
  const term = useDebouncedValue(value.trim(), 250)
  const suggestions = useQuery({
    queryKey: ["gene-suggestions", datasetId, chromosome?.name, term],
    queryFn: ({ signal }) =>
      suggestGenes(datasetId!, term, chromosome!.name, signal),
    enabled: !!datasetId && !!chromosome && term.length >= 2,
    staleTime: Infinity,
  })
  const options = (suggestions.data ?? []).filter(
    (gene) => gene.gene_id !== value
  )
  return (
    <div className="relative">
      <Input
        id="variant-gene"
        role="combobox"
        aria-expanded={focused && options.length > 0}
        aria-autocomplete="list"
        placeholder="Start typing…"
        autoComplete="off"
        className="font-mono"
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && options[0] && focused) {
            event.preventDefault()
            onChange(options[0].gene_id)
          }
        }}
      />
      {focused && options.length > 0 && (
        <ul
          role="listbox"
          // Above the field on phones: the dialog is docked to the bottom edge.
          className="absolute top-full right-0 left-0 z-10 mt-1 max-h-48 overflow-auto rounded-xl border bg-popover p-[3px] shadow-[0_8px_24px_rgb(0_0_0/0.2)] max-sm:top-auto max-sm:bottom-full max-sm:mb-1"
        >
          {options.map((gene) => (
            <li
              key={gene.gene_id}
              role="option"
              aria-selected={false}
              className="flex h-(--c22) cursor-pointer items-center gap-2 rounded-[3px] px-1.5 hover:bg-accent hover:text-accent-foreground"
              // mousedown so the choice lands before the input blurs
              onMouseDown={(event) => {
                event.preventDefault()
                onChange(gene.gene_id)
              }}
            >
              <span className="shrink-0 font-mono text-t11">
                {gene.gene_id}
              </span>
              <span className="truncate text-t11 text-muted-foreground">
                {gene.description || gene.name}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function VariantSearchForm({
  initialInterval,
}: {
  initialInterval: [number, number]
}) {
  const chromosome = usePlotStore((state) => state.chromosome)
  const searching = useUiStore((state) => state.variantSearching)
  const error = useUiStore((state) => state.variantSearchError)

  const size = chromosome?.size ?? 1
  const [range, setRange] = useState<[number, number]>(initialInterval)
  const [impact, setImpact] = useState<ImpactLevel>("HIGH")
  const [gene, setGene] = useState("")

  const byGene = gene.trim().length > 0
  const rangeValid = range[0] <= range[1]
  const setBound = (index: 0 | 1, value: number) => {
    const bounded = clamp(value, 1, size)
    setRange(index === 0 ? [bounded, range[1]] : [range[0], bounded])
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        void runVariantSearch(
          byGene
            ? { kind: "gene", gene: gene.trim() }
            : { kind: "interval", interval: range, impact }
        )
      }}
    >
      <fieldset
        disabled={byGene || searching}
        aria-label="Search by interval"
        className={cn(
          "flex flex-col gap-2.5 transition-opacity",
          byGene && "pointer-events-none opacity-40"
        )}
      >
        <div className="flex flex-col gap-1">
          <Label>
            Position range (bp)
            <span className="font-mono font-normal text-muted-foreground">
              {chromosome?.name}
            </span>
          </Label>
          <Slider
            min={1}
            max={size}
            className="my-1 max-lg:my-3 pointer-coarse:my-3"
            value={[Math.min(...range), Math.max(...range)]}
            onValueChange={(value) => setRange([value[0], value[1]])}
          />
          <div className="flex items-center gap-2">
            <PositionInput
              label="Range start"
              value={range[0]}
              invalid={!rangeValid}
              onChange={(value) => setBound(0, value)}
            />
            <span className="text-muted-foreground">to</span>
            <PositionInput
              label="Range end"
              value={range[1]}
              invalid={!rangeValid}
              onChange={(value) => setBound(1, value)}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <Label id="variant-impact">Impact</Label>
          <div
            role="radiogroup"
            aria-labelledby="variant-impact"
            className="grid h-(--control) grid-cols-3 overflow-hidden rounded-lg border border-input"
          >
            {IMPACT_LEVELS.map((level, index) => (
              <button
                key={level}
                type="button"
                role="radio"
                aria-checked={impact === level}
                onClick={() => setImpact(level)}
                className={cn(
                  "font-mono text-t11 font-medium whitespace-nowrap outline-none focus-visible:bg-accent",
                  index > 0 && "border-l border-input",
                  impact === level
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-muted"
                )}
              >
                {level}
              </button>
            ))}
          </div>
        </div>
      </fieldset>

      <div className="flex items-center gap-2 text-t11 text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or search by gene
        <span className="h-px flex-1 bg-border" />
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="variant-gene">
          Gene ID
          <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <GeneInput value={gene} onChange={setGene} disabled={searching} />
        {byGene && (
          <span className="flex items-center gap-1 text-t11 text-muted-foreground">
            <InfoIcon className="size-3" />
            Searching the whole gene; the interval above is ignored.
          </span>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button
        type="submit"
        className="h-(--c30) w-full"
        disabled={searching || (!byGene && !rangeValid)}
      >
        {searching && <Spinner />}
        {searching ? "Searching…" : "Search for variants"}
      </Button>
      {searching && (
        <span className="text-center text-t11 text-muted-foreground">
          Large intervals can take tens of seconds. You can close this dialog;
          results will be highlighted when ready.
        </span>
      )}
    </form>
  )
}

/** Finds variants by interval and impact, or by gene, and marks them on the plot. */
export function VariantSearchDialog() {
  const variantSearch = useUiStore((state) => state.variantSearch)
  const close = useUiStore((state) => state.closeVariantSearch)
  const interval = usePlotStore((state) => state.interval)
  const datasetId = usePlotStore((state) => state.datasetId)
  const datasets = useQuery({
    queryKey: ["datasets"],
    queryFn: ({ signal }) => getDatasets(signal),
  })
  const available =
    datasets.data?.find((dataset) => dataset.dataset_id === datasetId)
      ?.variant_search ?? true

  return (
    <Dialog open={variantSearch.open} onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Variant Search</DialogTitle>
        </DialogHeader>
        {variantSearch.open &&
          (available ? (
            <VariantSearchForm
              initialInterval={variantSearch.interval ?? interval ?? [1, 1]}
            />
          ) : (
            <p className="text-muted-foreground">
              Variant search is not available for this dataset: it was loaded
              from a Tersect index rather than from VCF files.
            </p>
          ))}
      </DialogContent>
    </Dialog>
  )
}

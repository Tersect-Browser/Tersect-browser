import { useMutation, useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Slider } from "@/components/ui/slider"
import { Spinner } from "@/components/ui/spinner"
import {
  IMPACT_LEVELS,
  searchVariantsByGene,
  searchVariantsInInterval,
  suggestGenes,
  type ImpactLevel,
} from "@/features/variants/search"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { clamp } from "@/lib/genome"
import { cn } from "@/lib/utils"
import { usePlotStore } from "@/store/plot-store"
import { useUiStore } from "@/store/ui-store"

function VariantSearchForm({
  initialInterval,
  onClose,
}: {
  initialInterval: [number, number]
  onClose: () => void
}) {
  const datasetId = usePlotStore((state) => state.datasetId)
  const chromosome = usePlotStore((state) => state.chromosome)
  const setVariantMatches = usePlotStore((state) => state.setVariantMatches)

  const chromosomeSize = chromosome?.size ?? 1
  const [range, setRange] = useState<[number, number]>(initialInterval)
  const [impact, setImpact] = useState<ImpactLevel>("HIGH")
  const [gene, setGene] = useState("")

  const geneTerm = useDebouncedValue(gene.trim().toLowerCase(), 300)
  const suggestions = useQuery({
    queryKey: ["gene-suggestions", chromosome?.name, geneTerm],
    queryFn: () => suggestGenes(geneTerm, chromosome!.name),
    enabled: chromosome !== undefined && geneTerm.length > 0,
    staleTime: Infinity,
  })

  const search = useMutation({
    mutationFn: () => {
      if (!datasetId || !chromosome) {
        throw new Error("No dataset is loaded")
      }
      return gene.trim()
        ? searchVariantsByGene(gene.trim(), chromosome.name)
        : searchVariantsInInterval(datasetId, chromosome.name, range, impact)
    },
    onSuccess: (result) => {
      setVariantMatches(result)
      toast.success(
        `${result.count} variant${result.count === 1 ? "" : "s"} found in ${result.totalAccessions.length} accession${result.totalAccessions.length === 1 ? "" : "s"}`
      )
      onClose()
    },
    onError: () => toast.error("The variant search failed."),
  })

  const setBound = (index: 0 | 1, text: string) => {
    const value = clamp(parseInt(text, 10) || 1, 1, chromosomeSize)
    setRange(index === 0 ? [value, range[1]] : [range[0], value])
  }
  const byGene = gene.trim().length > 0
  const rangeValid = range[0] <= range[1]

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        search.mutate()
      }}
    >
      <fieldset
        disabled={byGene || search.isPending}
        className={cn("flex flex-col gap-4", byGene && "opacity-40")}
      >
        <div className="text-sm font-medium">Search by interval</div>
        <div className="flex flex-col gap-2">
          <Label>Position range (bp)</Label>
          <Slider
            min={1}
            max={chromosomeSize}
            disabled={byGene}
            value={[Math.min(...range), Math.max(...range)]}
            onValueChange={(value) => setRange([value[0], value[1]])}
          />
          <div className="flex items-center gap-2">
            <Input
              aria-label="Range start"
              inputMode="numeric"
              className="font-mono"
              value={range[0]}
              aria-invalid={!rangeValid}
              onChange={(event) => setBound(0, event.target.value)}
            />
            <span className="text-sm text-muted-foreground">to</span>
            <Input
              aria-label="Range end"
              inputMode="numeric"
              className="font-mono"
              value={range[1]}
              aria-invalid={!rangeValid}
              onChange={(event) => setBound(1, event.target.value)}
            />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="variant-impact">Impact</Label>
          <Select
            value={impact}
            onValueChange={(value) => setImpact(value as ImpactLevel)}
          >
            <SelectTrigger id="variant-impact" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {IMPACT_LEVELS.map((level) => (
                <SelectItem key={level} value={level}>
                  {level}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </fieldset>

      <Separator />

      <div className="flex flex-col gap-2">
        <div className="text-sm font-medium">
          Search by high impact gene ID (optional)
        </div>
        <Label htmlFor="variant-gene">Gene ID</Label>
        <Input
          id="variant-gene"
          list="variant-gene-suggestions"
          placeholder="Start typing..."
          autoComplete="off"
          disabled={search.isPending}
          value={gene}
          onChange={(event) => setGene(event.target.value)}
        />
        <datalist id="variant-gene-suggestions">
          {suggestions.data?.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
      </div>

      <Button
        type="submit"
        className="w-full"
        disabled={search.isPending || (!byGene && !rangeValid)}
      >
        {search.isPending && <Spinner />}
        {search.isPending ? "Searching..." : "Search for variants"}
      </Button>
    </form>
  )
}

/** Finds variants by interval and impact, or by gene, and marks them on the plot. */
export function VariantSearchDialog() {
  const variantSearch = useUiStore((state) => state.variantSearch)
  const close = useUiStore((state) => state.closeVariantSearch)
  const interval = usePlotStore((state) => state.interval)

  return (
    <Dialog open={variantSearch.open} onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Variant search</DialogTitle>
          <DialogDescription>
            Matching variants are highlighted on the plot, in the row of each
            accession carrying them.
          </DialogDescription>
        </DialogHeader>
        {variantSearch.open && (
          <VariantSearchForm
            initialInterval={variantSearch.interval ?? interval ?? [1, 1]}
            onClose={close}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

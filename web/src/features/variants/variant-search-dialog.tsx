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
  searchVariantsInGene,
  searchVariantsInInterval,
  suggestGenes,
  type ImpactLevel,
} from "@/features/variants/search"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { getDatasets } from "@/lib/api"
import { clamp } from "@/lib/genome"
import { cn } from "@/lib/utils"
import { usePlotStore } from "@/store/plot-store"
import { useUiStore } from "@/store/ui-store"

function errorMessage(error: unknown) {
  try {
    return JSON.parse((error as Error).message).error ?? ""
  } catch {
    return ""
  }
}

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

  const geneTerm = useDebouncedValue(gene.trim(), 300)
  const suggestions = useQuery({
    queryKey: ["gene-suggestions", datasetId, chromosome?.name, geneTerm],
    queryFn: ({ signal }) =>
      suggestGenes(datasetId!, geneTerm, chromosome!.name, signal),
    enabled:
      datasetId !== undefined &&
      chromosome !== undefined &&
      geneTerm.length >= 2,
    staleTime: Infinity,
  })

  const search = useMutation({
    mutationFn: () => {
      if (!datasetId || !chromosome) {
        throw new Error("No dataset is loaded")
      }
      return gene.trim()
        ? searchVariantsInGene(datasetId, gene.trim(), impact)
        : searchVariantsInInterval(datasetId, chromosome.name, range, impact)
    },
    onSuccess: (result) => {
      setVariantMatches(result)
      const total = result.total ?? result.count
      const found = `${total} variant${total === 1 ? "" : "s"} found in ${result.totalAccessions.length} accession${result.totalAccessions.length === 1 ? "" : "s"}`
      if (total > result.count) {
        toast.warning(`${found}; showing the first ${result.count}.`)
      } else {
        toast.success(found)
      }
      onClose()
    },
    onError: (error) =>
      toast.error(`The variant search failed. ${errorMessage(error)}`),
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
      <div className="flex flex-col gap-2">
        <Label htmlFor="variant-impact">Effect impact</Label>
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
      </fieldset>

      <Separator />

      <div className="flex flex-col gap-2">
        <div className="text-sm font-medium">Search by gene (optional)</div>
        <Label htmlFor="variant-gene">Gene ID, name or description</Label>
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
          {suggestions.data?.map((match) => (
            <option key={match.gene_id} value={match.gene_id}>
              {match.description || match.name}
            </option>
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
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Variant search</DialogTitle>
          <DialogDescription>
            Matching variants are highlighted on the plot, in the row of each
            accession carrying them.
          </DialogDescription>
        </DialogHeader>
        {variantSearch.open &&
          (available ? (
            <VariantSearchForm
              initialInterval={variantSearch.interval ?? interval ?? [1, 1]}
              onClose={close}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Variant search is not available for this dataset: it was loaded
              from a Tersect index rather than from VCF files.
            </p>
          ))}
      </DialogContent>
    </Dialog>
  )
}

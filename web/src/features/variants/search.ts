import { toast } from "sonner"

import {
  searchGenes,
  searchVariantsInGene,
  searchVariantsInInterval,
} from "@/lib/api"
import type { GeneMatch, VariantSearchResult } from "@/lib/types"
import { usePlotStore } from "@/store/plot-store"
import { useUiStore } from "@/store/ui-store"

export const IMPACT_LEVELS = ["HIGH", "MODERATE", "LOW"] as const
export type ImpactLevel = (typeof IMPACT_LEVELS)[number]

/** Genes on the chromosome matching a partial id, name or description. */
export function suggestGenes(
  datasetId: string,
  term: string,
  chromosome: string,
  signal?: AbortSignal
): Promise<GeneMatch[]> {
  return searchGenes(datasetId, term, chromosome, signal)
}

export type VariantQuery =
  | { kind: "interval"; interval: [number, number]; impact: ImpactLevel }
  | { kind: "gene"; gene: string }

/** Message from a failed request (the backend answers `{ error }`). */
function errorMessage(error: unknown) {
  const text = error instanceof Error ? error.message : String(error)
  try {
    return (JSON.parse(text) as { error?: string }).error ?? text
  } catch {
    return text
  }
}

/**
 * Run a variant search and show its results on the plot. Runs independently
 * of the dialog, which may be closed while it is in progress.
 */
export async function runVariantSearch(query: VariantQuery): Promise<boolean> {
  const { datasetId, chromosome, setVariantMatches } = usePlotStore.getState()
  const ui = useUiStore.getState()
  if (!datasetId || !chromosome || ui.variantSearching) {
    return false
  }
  ui.setVariantSearching(true)
  try {
    const result: VariantSearchResult =
      query.kind === "gene"
        ? await searchVariantsInGene(datasetId, query.gene)
        : await searchVariantsInInterval(
            datasetId,
            chromosome.name,
            query.interval,
            query.impact
          )
    setVariantMatches(result)
    useUiStore.getState().setVariantSearching(false)
    useUiStore.getState().closeVariantSearch()
    const total = result.total ?? result.count
    if (total > result.count) {
      toast.warning(
        `${total.toLocaleString("en-US")} variants match; showing the first ${result.count.toLocaleString("en-US")}.`
      )
    }
    return true
  } catch (error) {
    useUiStore.getState().setVariantSearching(false, errorMessage(error))
    if (!useUiStore.getState().variantSearch.open) {
      toast.error("The variant search failed.")
    }
    return false
  }
}

export function clearVariantResults() {
  usePlotStore.getState().setVariantMatches(null)
  useUiStore.getState().setVariantTableOpen(false)
}

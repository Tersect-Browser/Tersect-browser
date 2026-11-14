import {
  searchGenes,
  searchVariantsInGene,
  searchVariantsInInterval,
} from "@/lib/api"
import type { GeneMatch } from "@/lib/types"

export const IMPACT_LEVELS = ["HIGH", "MODERATE", "LOW", "MODIFIER"] as const
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

export { searchVariantsInGene, searchVariantsInInterval }

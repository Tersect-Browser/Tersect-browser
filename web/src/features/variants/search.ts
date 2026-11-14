import TrixTextSearchAdapter from "@gmod/trix"
import { RemoteFile } from "generic-filehandle2"

import { searchVariantsInInterval } from "@/lib/api"
import { DATAFILES_URL } from "@/lib/config"
import type { Variant, VariantSearchResult } from "@/lib/types"

export const IMPACT_LEVELS = ["HIGH", "MODERATE", "LOW"] as const
export type ImpactLevel = (typeof IMPACT_LEVELS)[number]

/** Tomato gene identifier, e.g. Solyc01g005000.2 */
const GENE_PATTERN = /Solyc\d+g\d+\.\d+/

/** Text index of high-impact variants, built per chromosome at dataset setup. */
function trixAdapter(chromosome: string) {
  const base = new URL(
    `${DATAFILES_URL}/trix_indices/${chromosome}/${chromosome}`,
    window.location.origin
  ).href
  return new TrixTextSearchAdapter(
    new RemoteFile(`${base}.ixx`),
    new RemoteFile(`${base}.ix`),
    100
  )
}

/**
 * Index entries look like
 *   SL2.50ch01:95117896:T:G|acc1,acc2|EFF=STOP_GAINED(HIGH|...|Solyc01g...)
 * where the accession segment may be empty.
 */
function parseEntry(entry: string): Variant {
  let left = entry
  let eff = ""
  const effIndex = entry.indexOf("|EFF=")
  if (effIndex !== -1) {
    left = entry.slice(0, effIndex)
    eff = entry.slice(effIndex + 5)
  }
  const [coordinates, sampleSegment = ""] = left.split("|")
  const [chr, position, ref, alt] = coordinates.split(":")
  const accessions = sampleSegment
    .split(/[,\s]+/)
    .map((name) => name.trim().replace(/[ .]/g, "_").replace(/_+$/, ""))
    .filter((name) => name.length > 0)
  return {
    chr,
    pos: { start: parseInt(position, 10) },
    ref,
    alt,
    eff,
    accessions,
  }
}

function genesOf(entry: string): string[] {
  const genes = new Set<string>()
  const effects = entry
    .split("|EFF=")
    .slice(1)
    .join("|EFF=")
    .split(/,(?=EFF=)/)
  for (const effect of effects) {
    const payload = effect.match(/\(([^)]*)\)/)
    for (const field of payload?.[1].split("|") ?? []) {
      if (GENE_PATTERN.test(field)) {
        genes.add(field)
      }
    }
  }
  return [...genes]
}

async function searchIndex(term: string, chromosome: string) {
  const results = await trixAdapter(chromosome).search(term)
  return Array.from(new Set(results.map(([, entry]) => entry)))
}

/** Gene identifiers matching a partial search term. */
export async function suggestGenes(
  term: string,
  chromosome: string
): Promise<string[]> {
  const entries = await searchIndex(term, chromosome)
  return Array.from(new Set(entries.flatMap(genesOf)))
}

/** High-impact variants affecting a gene, anywhere on the chromosome. */
export async function searchVariantsByGene(
  gene: string,
  chromosome: string
): Promise<VariantSearchResult> {
  const variants = (await searchIndex(gene, chromosome)).map(parseEntry)
  const accessions = new Set(variants.flatMap((variant) => variant.accessions))
  return {
    region: "",
    filter: "",
    count: variants.length,
    variants,
    totalAccessions: Array.from(accessions).sort(),
  }
}

export { searchVariantsInInterval }

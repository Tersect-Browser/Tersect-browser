import { TB_API_URL, TGRC_API_URL } from "@/lib/config"
import { snvCountToJC } from "@/lib/genome"
import type {
  BrowserSettings,
  Chromosome,
  DatasetPublic,
  DistanceBinQuery,
  DistanceBins,
  GeneMatch,
  NewickTree,
  SequenceInterval,
  TreeQuery,
  VariantSearchResult,
} from "@/lib/types"

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  if (!response.ok) {
    const detail = await response.text().catch(() => "")
    throw new Error(detail || `Request failed (${response.status})`)
  }
  const text = await response.text()
  // Some endpoints answer with an empty body for "nothing found".
  return (text ? JSON.parse(text) : undefined) as T
}

function post<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  return request<T>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  })
}

const dataset = (datasetId: string) =>
  `${TB_API_URL}/query/${encodeURIComponent(datasetId)}`

export function getDatasets(signal?: AbortSignal) {
  return request<DatasetPublic[] | undefined>(`${TB_API_URL}/datasets`, {
    signal,
  })
}

export function getExportedSettings(exportId: string, signal?: AbortSignal) {
  return request<BrowserSettings | undefined>(
    `${TB_API_URL}/views/share/${encodeURIComponent(exportId)}`,
    { signal }
  )
}

export function exportSettings(settings: BrowserSettings) {
  return post<string>(`${TB_API_URL}/views/export`, settings)
}

export function getAccessionNames(datasetId: string, signal?: AbortSignal) {
  return request<string[]>(`${dataset(datasetId)}/samples`, { signal })
}

export function getChromosomes(datasetId: string, signal?: AbortSignal) {
  return request<Chromosome[]>(`${dataset(datasetId)}/chromosomes`, { signal })
}

export function getChromosomeGaps(
  datasetId: string,
  chromosome: string,
  signal?: AbortSignal
) {
  return request<SequenceInterval[]>(
    `${dataset(datasetId)}/gaps/${encodeURIComponent(chromosome)}`,
    { signal }
  )
}

/**
 * Binned genetic distances between the reference and each accession over an
 * interval, converted from SNV counts to Jukes-Cantor distances.
 */
export async function getDistanceBins(
  datasetId: string,
  query: DistanceBinQuery,
  signal?: AbortSignal
): Promise<DistanceBins> {
  const distanceBins = await post<DistanceBins>(
    `${dataset(datasetId)}/dist`,
    query,
    signal
  )
  if (!distanceBins?.bins || !distanceBins.query) {
    // The backend reports tersect failures as a JSON body with status 200.
    throw new Error("Distances could not be retrieved")
  }
  for (const accession of Object.keys(distanceBins.bins)) {
    distanceBins.bins[accession] = distanceBins.bins[accession].map((count) =>
      snvCountToJC(count, query.binsize)
    )
  }
  return distanceBins
}

/**
 * Phenetic tree for a set of accessions over an interval. The backend builds
 * trees in the background: poll until `status` is "ready".
 */
export function getNewickTree(
  datasetId: string,
  query: TreeQuery,
  signal?: AbortSignal
) {
  return post<NewickTree>(`${dataset(datasetId)}/tree`, query, signal)
}

export function generateBarcodes(
  datasetId: string,
  payload: {
    accessionName: string
    chrom: string
    start: number
    end: number
    size: number
    maxVar: number | null
  }
) {
  return post<{ downloadableURL: string }>(
    `${dataset(datasetId)}/generate-barcodes`,
    payload
  )
}

export interface IntrogressionRequest {
  datasetId: string
  chromosome: string
  interval: [number, number]
  /** The four taxa of the window scan, including the outgroup. */
  accessions: string[]
  /** All accessions on the plot, used for the species tree. */
  wholeAccessions: string[]
  outgroup: string
  blockSize: number
  maxReticulations: number
}

export function startIntrogressionScan(payload: IntrogressionRequest) {
  return post<{ datasetId?: string; accKey?: string }>(
    `${dataset(payload.datasetId)}/scan-introgression`,
    payload
  )
}

export function introgressionEventsUrl(datasetId: string, accKey: string) {
  return `${TB_API_URL}/sse/${encodeURIComponent(datasetId)}/${encodeURIComponent(accKey)}`
}

export function searchVariantsInInterval(
  datasetId: string,
  chromosome: string,
  interval: [number, number],
  impact: string
) {
  const params = new URLSearchParams({
    start: String(interval[0]),
    end: String(interval[1]),
    filter: impact,
  })
  return request<VariantSearchResult>(
    `${dataset(datasetId)}/variants/${encodeURIComponent(chromosome)}?${params}`
  )
}

/* ---------------------------------------------------------------- TGRC -- */

export interface GeneTGRC {
  gene: string
  locusName: string
}

export interface AccessionTGRC {
  accession: string
  alleles: { gene: string; allele: string }[]
}

export function getTgrcGenes(signal?: AbortSignal) {
  return request<GeneTGRC[]>(`${TGRC_API_URL}/genes`, { signal })
}

export function getTgrcAccessions(signal?: AbortSignal) {
  return request<AccessionTGRC[]>(`${TGRC_API_URL}/accessions`, { signal })
}

/** Alleles of one gene, keyed by TGRC accession number. */
export async function getTgrcGeneAlleles(
  gene: string
): Promise<Record<string, string>> {
  const accessions = await request<AccessionTGRC[]>(
    `${TGRC_API_URL}/accessions/${encodeURIComponent(gene)}/1`
  )
  const output: Record<string, string> = {}
  for (const accession of accessions) {
    if (accession.alleles[0]) {
      output[accession.accession] = accession.alleles[0].allele
    }
  }
  return output
}

/** Genes whose id, name or description contains `term`. */
export function searchGenes(
  datasetId: string,
  term: string,
  chromosome?: string,
  signal?: AbortSignal
) {
  const params = new URLSearchParams({ q: term })
  if (chromosome) {
    params.set("chrom", chromosome)
  }
  return request<GeneMatch[]>(`${dataset(datasetId)}/genes?${params}`, {
    signal,
  })
}

/** Variants affecting a gene, optionally with an effect of one impact level. */
export function searchVariantsInGene(
  datasetId: string,
  gene: string,
  impact?: string
) {
  const params = new URLSearchParams(impact ? { filter: impact } : {})
  return request<VariantSearchResult>(
    `${dataset(datasetId)}/genes/${encodeURIComponent(gene)}/variants?${params}`
  )
}

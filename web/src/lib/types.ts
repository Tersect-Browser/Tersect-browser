export interface Chromosome {
  name: string
  /** Size in base pairs. */
  size: number
}

export interface SequenceInterval {
  start: number
  end: number
  size?: number
}

export interface DistanceBinQuery {
  reference: string
  chromosome_name: string
  interval: number[]
  binsize: number
  accessions: string[]
}

export interface DistanceBins {
  query: DistanceBinQuery
  bins: Record<string, number[]>
}

export interface TreeNode {
  taxon?: { name: string; genotype?: string }
  length?: number
  children: TreeNode[]
}

export interface TreeQuery {
  chromosomeName: string
  interval: number[]
  accessions: string[]
}

export interface PheneticTree {
  query: TreeQuery | null
  root: TreeNode | null
}

/** Tree record as returned by the backend. */
export interface NewickTree {
  datasetId: string
  query: TreeQuery
  status: string
  tree?: string
}

export interface DatasetPublic {
  dataset_id: string
  view_id: string
  reference: string
}

export type AccessionDisplayStyle = "labels" | "tree_simple" | "tree_linear"

export type AccessionDictionary = Record<
  string,
  {
    label?: string
    /** One entry per colour track; null where the accession has no colour. */
    colors?: (string | null)[]
  }
>

export interface AccessionGroup {
  name: string
  category?: string
  color?: string
  accessions: string[]
}

export interface AccessionInfo {
  id: string
  Label: string
  [field: string]: string
}

/** Records the state of the browser interface; this is what gets shared. */
export interface BrowserSettings {
  dataset_id: string
  accession_style?: AccessionDisplayStyle
  accession_infos?: AccessionInfo[]
  accession_groups?: AccessionGroup[]
  selected_accessions?: string[]
  selected_reference?: string
  selected_chromosome?: Chromosome
  selected_interval?: number[]
  selected_binsize?: number
  zoom_level?: number
  plugins?: string[]
}

export interface PlotPosition {
  x: number
  y: number
}

export interface ContainerSize {
  width: number
  height: number
}

export type PlotTarget =
  | { type: "background" }
  | { type: "position"; position: number }
  | { type: "interval"; startPosition: number; endPosition: number }
  | { type: "accession"; accession: string; accessionLabel: string }
  | {
      type: "bin"
      accession: string
      accessionLabel: string
      startPosition: number
      endPosition: number
    }

export interface PlotPointerEvent {
  /** Viewport coordinates. */
  x: number
  y: number
  target: PlotTarget
}

export interface Variant {
  chr: string
  pos: { start: number }
  ref: string
  alt: string
  eff: string
  accessions: string[]
}

export interface VariantSearchResult {
  region: string
  filter: string
  count: number
  variants: Variant[]
  totalAccessions: string[]
}

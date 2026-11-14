/** Statistics for one block of consecutive gene-tree windows. */
export interface TripletBlock {
  mid_BP: number
  /** Gene trees per topology: species tree (T1) and the two discordant ones. */
  n_T1: number
  n_T2: number
  n_T3: number
  n_total: number
  p_sym?: number | null
  p_sym_fdr?: number | null
  obs_disc_frac?: number | null
  /** Expected discordant fraction under incomplete lineage sorting. */
  exp_disc_frac?: number | null
  asymmetry_score?: number | null
  mean_T2?: number | null
  mean_T3?: number | null
  /** mean_T2 - mean_T3 */
  delta?: number | null
  p_blt?: number | null
  p_blt_fdr?: number | null
}

export interface ScanResponse {
  params: { block_size: number }
  blocks: TripletBlock[]
}

export interface PhylonetResult {
  phyloText?: string
  phyloPlot?: string
  phyloIntroPlot?: string
}

/** Statistics for one block of consecutive gene-tree windows. */
export interface TripletBlock {
  mid_BP: number
  /** First and last base of the windows in the block. */
  start_BP?: number
  end_BP?: number
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
  sig_sym?: boolean
  sig_blt?: boolean
}

export interface ScanResponse {
  params: { block_size: number }
  global?: { windows?: number; trees_used?: number; unresolved?: number }
  blocks: TripletBlock[]
}

/** Stages of an introgression job, as shown by the job stepper. */
export const JOB_STAGES = [
  "Species tree",
  "Gene trees",
  "Window scan",
  "PhyloNet",
] as const

/** A block is significant if either test passes after FDR correction. */
export function isSignificant(block: TripletBlock): boolean {
  return Boolean(
    block.sig_sym ||
    block.sig_blt ||
    (block.p_sym_fdr ?? 1) < 0.05 ||
    (block.p_blt_fdr ?? 1) < 0.05
  )
}

export interface PhylonetResult {
  phyloText?: string
  phyloPlot?: string
  phyloIntroPlot?: string
}

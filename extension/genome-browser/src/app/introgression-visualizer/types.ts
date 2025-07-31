export type Mode = 'sister_introgression' | 'nonsister_test';

export interface TripletBlock {
  start_idx: number;
  mid_BP: number;
  tau_hat: number;
  obs_disc_frac: number;
  exp_disc_frac: number;
  mode: Mode;
  p_symmetry: number | null;
  p_total: number;
  n_trees: number;
  count_T2: number;
  count_T3: number;
  p_total_fdr: number;
  p_sym_fdr: number;
  sig_total: boolean;
  sig_sym: boolean;
}

export interface ScanGlobal {
  jackknife_mean_diff: number;
  jackknife_se: number | null;
  z_global: number;
  p_global: number;
}

export interface ScanParams {
  mu: number;
  ne: number;
  coal_factor: number;
  block_size: number;
  alpha: number;
  outgroup: string;
  taxa: string[];
}

export interface ScanResponse {
  params: ScanParams;
  global: ScanGlobal;
  blocks: TripletBlock[];
}

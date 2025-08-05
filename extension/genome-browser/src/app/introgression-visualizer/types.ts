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


// Old (topology) block
// export interface TripletBlock {
//   start_idx: number;
//   mid_BP: number;
//   tau_hat: number;
//   obs_disc_frac: number;
//   exp_disc_frac: number;
//   mode: 'sister_introgression' | 'nonsister_test' | string;
//   p_symmetry: number | null;
//   p_total: number;
//   p_total_fdr: number;
//   p_sym_fdr: number;
//   sig_total: boolean;
//   sig_sym: boolean;
//   n_trees: number;
//   count_T2: number;
//   count_T3: number;
// }

// // New (D3) block
// export interface D3Block {
//   start_idx: number;
//   mid_BP: number;
//   d3: number | null;
//   se_d3: number | null;
//   z_d3: number;
//   p_d3: number;
//   p_d3_fdr?: number;   // present if you ran FDR in the script
//   sig_d3?: boolean;
//   mean_d23?: number | null;
//   mean_d13?: number | null;
//   numer_sum?: number | null;
//   denom_sum?: number | null;
//   n_windows_used: number;
//   // the D3 script might also include topology counts; keep optional:
//   count_T1?: number; count_T2?: number; count_T3?: number;
// }

// // Old (topology) response
// export interface TripletScanResponse {
//   params: { block_size: number; alpha: number; taxa: string[]; outgroup: string; };
//   global: { jackknife_mean_diff: number; jackknife_se: number | null; z_global: number; p_global: number; };
//   blocks: TripletBlock[];
// }

// // New (D3) response
// export interface D3ScanResponse {
//   params: { block_size: number; alpha: number; taxa: string[]; statistic?: string; };
//   global: { d3_mean: number | null; jackknife_se: number | null; z_global: number; p_global: number; };
//   blocks: D3Block[];
// }

// // Union you can use in the component
// export type ScanResponse = TripletScanResponse | D3ScanResponse;

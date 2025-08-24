// export type Mode = 'sister_introgression' | 'nonsister_test';

// export interface TripletBlock {
//   start_idx: number;
//   mid_BP: number;
//   tau_hat: number;
//   obs_disc_frac: number;
//   exp_disc_frac: number;
//   mode: Mode;
//   p_symmetry: number | null;
//   p_total: number;
//   n_trees: number;
//   count_T2: number;
//   count_T3: number;
//   p_total_fdr: number;
//   p_sym_fdr: number;
//   sig_total: boolean;
//   sig_sym: boolean;
// }

// export interface ScanGlobal {
//   jackknife_mean_diff: number;
//   jackknife_se: number | null;
//   z_global: number;
//   p_global: number;
// }

// export interface ScanParams {
//   mu: number;
//   ne: number;
//   coal_factor: number;
//   block_size: number;
//   alpha: number;
//   outgroup: string;
//   taxa: string[];
// }

// export interface ScanResponse {
//   params: ScanParams;
//   global: ScanGlobal;
//   blocks: TripletBlock[];
// }

// New: which analyses are present
export type Method = 'DCT' | 'BLT';

// Back-compat with your previous union (kept optional below)
export type Mode = 'sister_introgression' | 'nonsister_test';

export interface TripletBlock {
  // Core indices/position
  start_idx: number;
  mid_BP: number;

  // ---------- DCT (counts-based) ----------
  n_T1: number;
  n_T2: number;
  n_T3: number;
  n_total: number;      // = n_T1 + n_T2 + n_T3 (ERRORs excluded)
  n_error: number;      // windows that failed labeling

  // DCT stats
  p_sym: number;                 // raw p for T2 vs T3 symmetry
  p_sym_fdr: number;             // FDR-corrected p for symmetry
  p_total: number | null;        // raw p for total discordance vs expected (needs tau), else null
  p_total_fdr: number | null;    // FDR-corrected p_total or null
  p_disc_expected?: number | null; // expected discordant fraction under ILS if tau available

  // ---------- BLT (distance-based) ----------
  mean_T2: number | null;  // mean distance for T2 discordant trees (p1–p3)
  mean_T3: number | null;  // mean distance for T3 discordant trees (p2–p3)
  delta: number | null;    // mean_T2 - mean_T3
  se_delta: number | null; // jackknife SE of delta
  z_blt: number | null;    // z-stat for BLT
  p_blt: number;           // raw p for BLT (two-sided)
  p_blt_fdr: number;       // FDR-corrected p_blt

  // Significance flags
  sig_sym: boolean;
  sig_total: boolean;
  sig_blt: boolean;

  // ---------- Back-compat (optional; from older schema) ----------
  tau_hat?: number;
  obs_disc_frac?: number;
  exp_disc_frac?: number;
  mode?: Mode;
  p_symmetry?: number | null;
  n_trees?: number;
  count_T2?: number;
  count_T3?: number;
}

export interface ScanGlobal {
  methods: Method[];   // e.g. ['DCT', 'BLT']
  notes?: string;
  // Back-compat optional fields (from older schema)
  jackknife_mean_diff?: number;
  jackknife_se?: number | null;
  z_global?: number;
  p_global?: number;
}

export interface ScanParams {
  block_size: number;
  outgroup: string;
  taxa: string[];
  uses_tau_for_total_test: boolean;

  // Back-compat optional fields (safe to ignore in new flow)
  mu?: number;
  ne?: number;
  coal_factor?: number;
  alpha?: number;
}

export interface ScanResponse {
  params: ScanParams;
  global: ScanGlobal;
  blocks: TripletBlock[];
}




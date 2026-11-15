/** Base path the app is served under, always ending in a slash. */
export const BASE_URL = import.meta.env.BASE_URL

export const TB_API_URL = `${BASE_URL}tbapi`
export const TGRC_API_URL = `${BASE_URL}tgrc`
/** Builder service: uploads, dataset builds (pipeline/tbpipeline/server). */
export const BUILDER_API_URL = `${BASE_URL}api`

/** The backend serves dataset files (indices, plots, barcodes) from here. */
export const DATAFILES_URL = "/TersectBrowserGP/datafiles"

/**
 * Re-root a URL produced by the backend or by the dataset setup scripts onto
 * the current origin. Those URLs embed whichever host was configured when they
 * were generated; the paths are what the app actually serves or proxies.
 */
export function toSameOrigin(url: string): string {
  const parsed = new URL(url, window.location.origin)
  return new URL(
    parsed.pathname + parsed.search + parsed.hash,
    window.location.origin
  ).href
}

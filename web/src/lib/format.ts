/**
 * The one place genomic numbers are turned into text, so coordinates read the
 * same in every part of the interface.
 */

const EN_DASH = "–"

/** Exact position: `12,345,678` */
export function formatPosition(position: number): string {
  // Math.abs avoids "-0"
  return Math.abs(Math.round(position)).toLocaleString("en-US")
}

/** Range: `12,345,678 – 12,395,678` */
export function formatRange(start: number, end: number): string {
  return `${formatPosition(start)} ${EN_DASH} ${formatPosition(end)}`
}

/** Locus: `SL2.50ch06:12,345,678–12,395,678` */
export function formatLocus(
  chromosome: string,
  start: number,
  end: number
): string {
  return `${chromosome}:${formatPosition(start)}${EN_DASH}${formatPosition(end)}`
}

function megabases(position: number): string {
  return (Math.abs(position) / 1e6).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/** Ruler and summaries: `12.35 Mbp` */
export function formatMbp(position: number): string {
  return `${megabases(position)} Mbp`
}

/** Summary of an interval: `30.00 – 46.00 Mbp` */
export function formatMbpRange(start: number, end: number): string {
  return `${megabases(start)} ${EN_DASH} ${megabases(end)} Mbp`
}

/** Ruler label where ticks are closer than 10 kbp: `12,345.5 kbp` */
export function formatKbp(position: number): string {
  return `${(Math.abs(position) / 1e3).toLocaleString("en-US", {
    maximumFractionDigits: 2,
  })} kbp`
}

/** Sizes: `50,000 bp` */
export function formatSize(size: number): string {
  return `${formatPosition(size)} bp`
}

/** Read a position typed with or without thousands separators. */
export function parsePosition(text: string): number | null {
  const digits = text.replace(/[^\d]/g, "")
  return digits ? parseInt(digits, 10) : null
}

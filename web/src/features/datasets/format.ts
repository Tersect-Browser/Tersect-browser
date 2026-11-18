/** Sizes, durations and counts as the upload screens write them. */

/** `247 MB`, `1.1 GB`, `2 KB`. Decimal units, like file managers. */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes)) return "—"
  const units = ["B", "KB", "MB", "GB", "TB"]
  let value = bytes
  let unit = 0
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000
    unit += 1
  }
  const digits = unit >= 3 && value < 10 ? 1 : 0
  return `${value.toFixed(digits)} ${units[unit]}`
}

/** `8.4 MB/s` */
export const formatSpeed = (bytesPerSecond: number) =>
  `${formatBytes(bytesPerSecond)}/s`

/** `48 s`, `6 min 12 s`, `2 h 41 min`. */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return "—"
  const s = Math.max(0, Math.round(seconds))
  if (s < 60) return `${s} s`
  if (s < 3600) {
    const rest = s % 60
    return rest ? `${Math.floor(s / 60)} min ${rest} s` : `${s / 60} min`
  }
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return `${h} h ${String(m).padStart(2, "0")} min`
}

/** Loose remaining-time text for uploads: `58 s left`, `about 4 min left`. */
export function formatTimeLeft(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return ""
  if (seconds < 90) return `${Math.max(1, Math.round(seconds))} s left`
  if (seconds < 3600) return `about ${Math.round(seconds / 60)} min left`
  return `about ${Math.round(seconds / 3600)} h left`
}

/** `14,209,331` */
export const formatCount = (n: number) => n.toLocaleString("en-US")

/** `Today 14:02`, `12 Nov 09:15` */
export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—"
  const date = new Date(iso)
  const time = date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  })
  const today = new Date()
  if (date.toDateString() === today.toDateString()) return `Today ${time}`
  return `${date.getDate()} ${date.toLocaleString("en-GB", { month: "short" })} ${time}`
}

/** Last path or URL segment. */
export function fileNameOf(location: string): string {
  const clean = location.split(/[?#]/)[0].replace(/\/+$/, "")
  return decodeURIComponent(clean.slice(clean.lastIndexOf("/") + 1)) || clean
}

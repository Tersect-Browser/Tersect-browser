export type Rgba = [number, number, number, number]

/**
 * Colours and fonts used by the canvas drawing code, read from the `--viz-*`
 * design tokens (see index.css) so the plot follows the theme.
 */
export interface PlotTheme {
  /** Heatmap ramp stops, from low to high distance. */
  heat: Rgba[]
  gap: Rgba
  variant: Rgba
  label: string
  tree: string
  leader: string
  ruler: string
  /** --viz-variant as a CSS colour, for canvas fills. */
  variantColor: string
  monoFont: string
}

const HEAT_STOPS = 5

let probe: CanvasRenderingContext2D | null = null

/** Resolve a CSS colour to RGBA bytes. */
function toRgba(color: string): Rgba {
  const hex = /^#([0-9a-f]{6})$/i.exec(color)
  if (hex) {
    const value = parseInt(hex[1], 16)
    return [value >> 16, (value >> 8) & 0xff, value & 0xff, 255]
  }
  // Tokens are specified as hex; this covers anything else.
  probe ??= document
    .createElement("canvas")
    .getContext("2d", { willReadFrequently: true })
  if (!probe) {
    return [0, 0, 0, 255]
  }
  probe.clearRect(0, 0, 1, 1)
  probe.fillStyle = "#000"
  probe.fillStyle = color
  probe.fillRect(0, 0, 1, 1)
  const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data
  return [r, g, b, a]
}

/** Read the plot theme currently in effect on the page. */
export function readPlotTheme(): PlotTheme {
  const style = getComputedStyle(document.documentElement)
  const value = (name: string) => style.getPropertyValue(name).trim()
  return {
    heat: Array.from({ length: HEAT_STOPS }, (_, stop) =>
      toRgba(value(`--viz-heat-grey-${stop}`))
    ),
    gap: toRgba(value("--viz-gap")),
    variant: toRgba(value("--viz-variant")),
    label: value("--viz-label"),
    tree: value("--viz-tree"),
    leader: value("--viz-leader"),
    ruler: value("--viz-ruler"),
    variantColor: value("--viz-variant"),
    monoFont: value("--font-mono") || "monospace",
  }
}

/**
 * The light plot theme, whatever the page is showing. Exported images always
 * use it.
 */
export function readLightPlotTheme(): PlotTheme {
  const root = document.documentElement
  if (!root.classList.contains("dark")) {
    return readPlotTheme()
  }
  root.classList.remove("dark")
  try {
    return readPlotTheme()
  } finally {
    root.classList.add("dark")
  }
}

const PALETTE_LEVELS = 256

/**
 * 256-entry lookup table interpolated linearly in RGB between the ramp
 * stops, as packed RGBA bytes.
 */
export function buildHeatPalette(theme: PlotTheme): Uint8ClampedArray {
  const palette = new Uint8ClampedArray(PALETTE_LEVELS * 4)
  const segments = theme.heat.length - 1
  for (let i = 0; i < PALETTE_LEVELS; i++) {
    const position = (i / (PALETTE_LEVELS - 1)) * segments
    const stop = Math.min(Math.floor(position), segments - 1)
    const weight = position - stop
    const from = theme.heat[stop]
    const to = theme.heat[stop + 1]
    for (let channel = 0; channel < 3; channel++) {
      palette[i * 4 + channel] = Math.round(
        from[channel] + (to[channel] - from[channel]) * weight
      )
    }
    palette[i * 4 + 3] = 255
  }
  return palette
}

/** Offset into the palette for a distance relative to the column maximum. */
export function paletteOffset(distance: number, maxDistance: number): number {
  if (maxDistance === 0) {
    return 0
  }
  return Math.floor((distance / maxDistance) * (PALETTE_LEVELS - 1)) * 4
}

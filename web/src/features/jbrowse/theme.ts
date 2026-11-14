/**
 * Makes embedded JBrowse look like part of Tersect Browser: its Material UI
 * theme is built from the design tokens, and the gene and variant tracks are
 * drawn in the data-visualisation colours.
 *
 * MUI computes hover and disabled shades from palette colours and cannot
 * parse oklch(), so palette entries are resolved to hex. Component overrides
 * use var(--token) directly, so they follow the page theme by themselves.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- JBrowse configuration
   is plain JSON whose shape is defined by JBrowse. */

let probe: CanvasRenderingContext2D | null = null

/** Any CSS colour (including oklch) as #rrggbb. */
function toHex(color: string): string {
  probe ??= document
    .createElement("canvas")
    .getContext("2d", { willReadFrequently: true })
  if (!probe) {
    return "#000000"
  }
  probe.clearRect(0, 0, 1, 1)
  probe.fillStyle = "#000"
  probe.fillStyle = color
  probe.fillRect(0, 0, 1, 1)
  const [r, g, b] = probe.getImageData(0, 0, 1, 1).data
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`
}

export interface JBrowseTokens {
  dark: boolean
  primary: string
  primaryForeground: string
  background: string
  card: string
  foreground: string
  muted: string
  mutedForeground: string
  border: string
  gene: string
  variant: string
  ruler: string
  label: string
}

export function readJBrowseTokens(): JBrowseTokens {
  const style = getComputedStyle(document.documentElement)
  const token = (name: string) => toHex(style.getPropertyValue(name).trim())
  return {
    dark: document.documentElement.classList.contains("dark"),
    primary: token("--primary"),
    primaryForeground: token("--primary-foreground"),
    background: token("--background"),
    card: token("--card"),
    foreground: token("--foreground"),
    muted: token("--muted"),
    mutedForeground: token("--muted-foreground"),
    border: token("--border"),
    gene: token("--viz-gene"),
    variant: token("--viz-variant"),
    ruler: token("--viz-ruler"),
    label: token("--viz-label"),
  }
}

const SANS = '"IBM Plex Sans", system-ui, sans-serif'
const MONO = '"IBM Plex Mono", ui-monospace, monospace'
const POPOVER_SHADOW = "0 8px 24px rgb(0 0 0 / 0.2)"

/** JBrowse `configuration` with a theme built from the tokens. */
export function jbrowseConfiguration(t: JBrowseTokens): Record<string, any> {
  const primary = { main: t.primary, contrastText: t.primaryForeground }
  return {
    theme: {
      palette: {
        mode: t.dark ? "dark" : "light",
        primary,
        // JBrowse paints its view header and the focused-view outline with
        // `secondary`: chrome is neutral, so map it to the muted surface.
        secondary: { main: t.muted, contrastText: t.foreground },
        // Overview scale bar and region labels: the ruler colour.
        tertiary: { main: t.ruler, contrastText: t.primaryForeground },
        quaternary: { main: t.border, contrastText: t.foreground },
        background: { default: t.card, paper: t.card },
        text: { primary: t.foreground, secondary: t.mutedForeground },
        divider: t.border,
      },
      shape: { borderRadius: 4 },
      typography: {
        fontFamily: SANS,
        fontSize: 12,
        body1: { fontSize: 12 },
        body2: { fontSize: 11 },
        caption: { fontSize: 10 },
        button: { fontSize: 12, fontWeight: 500, textTransform: "none" },
      },
      components: {
        MuiPaper: {
          styleOverrides: {
            root: { backgroundImage: "none", boxShadow: "none" },
          },
        },
        MuiButton: {
          defaultProps: { size: "small", disableElevation: true },
          styleOverrides: {
            root: {
              minHeight: 24,
              padding: "0 8px",
              borderRadius: "var(--radius)",
              fontFamily: SANS,
            },
            outlined: { borderColor: "var(--input)" },
          },
        },
        MuiIconButton: {
          defaultProps: { size: "small" },
          styleOverrides: {
            root: {
              padding: 4,
              borderRadius: "var(--radius)",
              color: "var(--foreground)",
              "&:hover": { backgroundColor: "var(--accent)" },
            },
          },
        },
        MuiSvgIcon: {
          styleOverrides: { fontSizeSmall: { fontSize: 16 } },
        },
        MuiToolbar: {
          styleOverrides: { dense: { minHeight: 32 } },
        },
        MuiInputBase: {
          styleOverrides: {
            root: { fontFamily: MONO, fontSize: 11 },
            input: { padding: "3px 6px" },
          },
        },
        MuiOutlinedInput: {
          styleOverrides: {
            notchedOutline: { borderColor: "var(--input)" },
            root: {
              borderRadius: "var(--radius)",
              backgroundColor: "var(--background)",
              "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
                borderColor: "var(--ring)",
                borderWidth: 1,
              },
            },
          },
        },
        MuiPopover: {
          styleOverrides: {
            paper: {
              border: "1px solid var(--border)",
              borderRadius: 6,
              boxShadow: POPOVER_SHADOW,
              backgroundColor: "var(--popover)",
            },
          },
        },
        MuiMenu: {
          styleOverrides: {
            paper: {
              border: "1px solid var(--border)",
              borderRadius: 6,
              boxShadow: POPOVER_SHADOW,
              backgroundColor: "var(--popover)",
            },
            list: { padding: 3 },
          },
        },
        MuiMenuItem: {
          styleOverrides: {
            root: {
              minHeight: 24,
              fontSize: 12,
              borderRadius: 3,
              "&:hover": {
                backgroundColor: "var(--accent)",
                color: "var(--accent-foreground)",
              },
            },
          },
        },
        MuiListItemIcon: {
          styleOverrides: {
            root: { minWidth: 24, color: "var(--muted-foreground)" },
          },
        },
        // Same look as the plot tooltip.
        MuiTooltip: {
          styleOverrides: {
            tooltip: {
              backgroundColor: "var(--foreground)",
              color: "var(--background)",
              fontFamily: MONO,
              fontSize: 11,
              borderRadius: 4,
              padding: "4px 7px",
            },
          },
        },
        MuiDialog: {
          styleOverrides: {
            paper: {
              border: "1px solid var(--border)",
              borderRadius: 8,
              boxShadow: "0 16px 48px rgb(0 0 0 / 0.3)",
            },
          },
        },
        MuiCheckbox: {
          styleOverrides: { root: { padding: 4 } },
        },
      },
    },
  }
}

/** The gene track's display: gene glyphs in --viz-gene, Plex labels. */
function geneDisplay(trackId: string, t: JBrowseTokens, compact: boolean) {
  return {
    type: "LinearBasicDisplay",
    displayId: `${trackId}-LinearBasicDisplay`,
    renderer: {
      type: "CanvasFeatureRenderer",
      color1: t.gene,
      color2: t.gene,
      color3: t.gene,
      outline: "",
      height: compact ? 8 : 12,
      showLabels: !compact,
      showDescriptions: false,
      displayDirectionalChevrons: true,
      labels: {
        nameColor: t.label,
        descriptionColor: t.mutedForeground,
        fontSize: 11,
      },
    },
  }
}

/** A variant track's display: variants in --viz-variant. */
function variantDisplay(trackId: string, t: JBrowseTokens) {
  return {
    type: "LinearVariantDisplay",
    displayId: `${trackId}-LinearVariantDisplay`,
    // Resequenced accessions are dense; draw them at bin-level zoom.
    maxFeatureScreenDensity: 20,
    fetchSizeLimit: 100_000_000,
    renderer: {
      type: "CanvasFeatureRenderer",
      color1: t.variant,
      color2: t.variant,
      outline: "",
      height: 10,
      showLabels: false,
      showDescriptions: false,
    },
  }
}

/** Dataset tracks with Tersect Browser displays added. */
export function styleTracks(
  tracks: any[],
  t: JBrowseTokens,
  { compact = false }: { compact?: boolean } = {}
): any[] {
  return tracks.map((track) => {
    if (track.type === "FeatureTrack") {
      return { ...track, displays: [geneDisplay(track.trackId, t, compact)] }
    }
    if (track.type === "VariantTrack") {
      return { ...track, displays: [variantDisplay(track.trackId, t)] }
    }
    return track
  })
}

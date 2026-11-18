import deepEqual from "fast-deep-equal"
import { create } from "zustand"

import { ceilTo, clamp, floorTo, sameElements } from "@/lib/genome"
import type {
  AccessionDictionary,
  AccessionDisplayStyle,
  AccessionGroup,
  AccessionInfo,
  BrowserSettings,
  Chromosome,
  DistanceBins,
  NewickTree,
  PheneticTree,
  PlotPosition,
  SequenceInterval,
  VariantSearchResult,
} from "@/lib/types"
import { parseNewick, treeToOrderedList } from "@/plot/tree"

export const DEFAULT_BINSIZE = 50000
export const BINSIZE_MIN = 1000
export const BINSIZE_MAX = 100000
export const BINSIZE_STEP = 1000

export const MIN_ZOOM_LEVEL = 100
export const MAX_ZOOM_LEVEL = 1000
const ZOOM_FACTOR = 1.3
const ZOOM_ROUND_TO = 50

/**
 * Per-accession label and group colours, for quick lookup when drawing.
 * There is one colour track per group category that has a coloured group.
 */
function buildDictionary(
  infos: AccessionInfo[] | undefined,
  groups: AccessionGroup[]
): AccessionDictionary {
  const dictionary: AccessionDictionary = {}
  for (const info of infos ?? []) {
    dictionary[info.id] = { label: info.Label }
  }
  const colored = groups.filter((group) => Boolean(group.color))
  const categories = Array.from(
    new Set(colored.map((group) => group.category))
  ).sort((a, b) =>
    a === undefined ? 1 : b === undefined ? -1 : a.localeCompare(b)
  )
  for (const group of colored) {
    const track = categories.indexOf(group.category)
    for (const accession of group.accessions) {
      const entry = (dictionary[accession] ??= {})
      entry.colors ??= categories.map(() => null)
      entry.colors[track] = group.color ?? null
    }
  }
  return dictionary
}

interface PlotState {
  /* ---- view settings (what gets shared) ---- */
  datasetId: string | undefined
  accessionStyle: AccessionDisplayStyle
  accessionInfos: AccessionInfo[] | undefined
  accessionGroups: AccessionGroup[]
  accessions: string[] | undefined
  reference: string | undefined
  chromosome: Chromosome | undefined
  interval: [number, number] | undefined
  binsize: number | undefined
  zoomLevel: number
  plugins: string[]

  /* ---- derived / loaded ---- */
  chromosomes: Chromosome[]
  accessionDictionary: AccessionDictionary
  /** Accessions in drawing order (clustered by the tree). */
  orderedAccessions: string[] | null
  /** Scroll position in bins (x) and accessions (y); zero or negative. */
  plotPosition: PlotPosition
  distanceBins: DistanceBins | undefined
  pheneticTree: PheneticTree
  sequenceGaps: SequenceInterval[] | undefined

  /* ---- transient plot UI ---- */
  /** Region selected by dragging on the ruler. */
  highlight: SequenceInterval | undefined
  /** Width in pixels of the label / tree pane left of the heatmap. */
  treeWidth: number
  variantMatches: VariantSearchResult | null

  loadSettings: (settings: BrowserSettings, chromosomes: Chromosome[]) => void
  getSettings: () => BrowserSettings
  reset: () => void

  setAccessionStyle: (style: AccessionDisplayStyle) => void
  setReference: (reference: string) => void
  setChromosome: (chromosome: Chromosome) => void
  setInterval: (interval: [number, number]) => void
  setBinsize: (binsize: number) => void
  zoomIn: () => void
  zoomOut: () => void
  applyAccessions: (
    accessions: string[],
    groups: AccessionGroup[],
    infos?: AccessionInfo[]
  ) => void
  removeAccession: (accession: string) => void

  commitPlot: (
    distanceBins: DistanceBins,
    tree: NewickTree,
    gaps: SequenceInterval[]
  ) => void
  setPlotPosition: (position: PlotPosition) => void
  setHighlight: (highlight: SequenceInterval | undefined) => void
  setTreeWidth: (width: number) => void
  setVariantMatches: (matches: VariantSearchResult | null) => void
}

const initialState = {
  datasetId: undefined,
  accessionStyle: "labels" as AccessionDisplayStyle,
  accessionInfos: undefined,
  accessionGroups: [],
  accessions: undefined,
  reference: undefined,
  chromosome: undefined,
  interval: undefined,
  binsize: undefined,
  zoomLevel: MIN_ZOOM_LEVEL,
  plugins: [],
  chromosomes: [],
  accessionDictionary: {},
  orderedAccessions: null,
  plotPosition: { x: 0, y: 0 },
  distanceBins: undefined,
  pheneticTree: { query: null, root: null },
  sequenceGaps: undefined,
  highlight: undefined,
  treeWidth: 0,
  variantMatches: null,
}

export const usePlotStore = create<PlotState>()((set, get) => ({
  ...initialState,

  loadSettings: (settings, chromosomes) => {
    const groups = settings.accession_groups ?? []
    const interval = settings.selected_interval
    set({
      ...initialState,
      datasetId: settings.dataset_id,
      accessionStyle: settings.accession_style ?? "labels",
      accessionInfos: settings.accession_infos,
      accessionGroups: groups,
      accessions: settings.selected_accessions,
      reference: settings.selected_reference,
      chromosome: settings.selected_chromosome,
      interval: interval ? [interval[0], interval[1]] : undefined,
      binsize: settings.selected_binsize,
      zoomLevel: clamp(
        settings.zoom_level ?? MIN_ZOOM_LEVEL,
        MIN_ZOOM_LEVEL,
        MAX_ZOOM_LEVEL
      ),
      plugins: settings.plugins ?? [],
      chromosomes,
      accessionDictionary: buildDictionary(settings.accession_infos, groups),
    })
  },

  getSettings: () => {
    const state = get()
    return {
      dataset_id: state.datasetId ?? "",
      accession_style: state.accessionStyle,
      accession_infos: state.accessionInfos,
      accession_groups: state.accessionGroups,
      selected_accessions: state.accessions,
      selected_reference: state.reference,
      selected_chromosome: state.chromosome,
      selected_interval: state.interval,
      selected_binsize: state.binsize,
      zoom_level: state.zoomLevel,
      plugins: state.plugins,
    }
  },

  reset: () => set(initialState),

  setAccessionStyle: (accessionStyle) => set({ accessionStyle }),
  setReference: (reference) => set({ reference }),
  setChromosome: (chromosome) => {
    const current = get().chromosome
    if (current?.name !== chromosome.name || current.size !== chromosome.size) {
      set({ chromosome, interval: [1, chromosome.size] })
    }
  },
  setInterval: (interval) => set({ interval }),
  setBinsize: (binsize) =>
    set({
      binsize: clamp(ceilTo(binsize, BINSIZE_STEP), BINSIZE_MIN, BINSIZE_MAX),
    }),

  zoomIn: () =>
    set((state) => ({
      zoomLevel: Math.min(
        ceilTo(state.zoomLevel * ZOOM_FACTOR, ZOOM_ROUND_TO),
        MAX_ZOOM_LEVEL
      ),
    })),
  zoomOut: () =>
    set((state) => ({
      zoomLevel: Math.max(
        floorTo(state.zoomLevel / ZOOM_FACTOR, ZOOM_ROUND_TO),
        MIN_ZOOM_LEVEL
      ),
    })),

  applyAccessions: (accessions, groups, infos) => {
    const state = get()
    const accessionInfos = infos ?? state.accessionInfos
    set({
      // Keep the same array when only the order differs, so the plot is not
      // reloaded needlessly.
      accessions: sameElements(accessions, state.accessions)
        ? state.accessions
        : [...accessions],
      accessionGroups: groups,
      accessionInfos,
      accessionDictionary: buildDictionary(accessionInfos, groups),
      reference:
        state.reference !== undefined && accessions.includes(state.reference)
          ? state.reference
          : accessions[0],
    })
  },

  removeAccession: (accession) => {
    const state = get()
    if (!state.accessions) {
      return
    }
    state.applyAccessions(
      state.accessions.filter((id) => id !== accession),
      state.accessionGroups
    )
  },

  commitPlot: (distanceBins, tree, gaps) => {
    const state = get()
    if (state.distanceBins === distanceBins) {
      return
    }
    if (deepEqual(state.pheneticTree.query, tree.query)) {
      set({ distanceBins, variantMatches: null })
      return
    }
    // Tree updated: accession order changes, so the scroll position resets.
    const root = parseNewick(tree.tree ?? "", true)
    set({
      distanceBins,
      pheneticTree: { query: tree.query, root },
      orderedAccessions: treeToOrderedList(root),
      sequenceGaps: gaps,
      plotPosition: { x: 0, y: 0 },
      variantMatches: null,
    })
  },

  setPlotPosition: (plotPosition) => {
    const current = get().plotPosition
    if (current.x !== plotPosition.x || current.y !== plotPosition.y) {
      set({ plotPosition })
    }
  },
  setHighlight: (highlight) => set({ highlight }),
  setTreeWidth: (treeWidth) => {
    if (get().treeWidth !== treeWidth) {
      set({ treeWidth })
    }
  },
  setVariantMatches: (variantMatches) => set({ variantMatches }),
}))

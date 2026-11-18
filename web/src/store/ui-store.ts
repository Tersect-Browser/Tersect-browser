import { create } from "zustand"

import type { PlotPointerEvent } from "@/lib/types"

export interface BarcodeTarget {
  /** Accession id, as named in the Tersect index. */
  accession: string
  /** Display label. */
  accessionName: string
  chromosome: string
  start: number
  end: number
}

export interface GenomeDialogTarget {
  /** Accession id; also the id of its variant track. */
  accession: string
  accessionName: string
  /** Region to show; the whole chromosome when omitted. */
  interval?: [number, number]
}

export interface IntrogressionTarget {
  chromosome: string
  interval: [number, number]
}

/** Toolbar group shown as a bottom sheet on touch layouts. */
export type ToolbarSheet = "none" | "show" | "where" | "analysis" | "output"

interface UiState {
  /** Which toolbar sheet is open (touch layouts only). */
  toolbarSheet: ToolbarSheet
  accessionSheetOpen: boolean
  genomeTrackVisible: boolean
  genomeDialogTarget: GenomeDialogTarget | null
  barcodeTarget: BarcodeTarget | null
  variantSearch: { open: boolean; interval?: [number, number] }
  /** A variant search is running (it continues if the dialog is closed). */
  variantSearching: boolean
  variantSearchError: string | null
  /** The variant results table under the plot is shown. */
  variantTableOpen: boolean
  introgressionTarget: IntrogressionTarget | null
  /** Incremented to ask the introgression panel to close (it may confirm). */
  introgressionCloseRequest: number
  contextMenu: PlotPointerEvent | null

  setToolbarSheet: (sheet: ToolbarSheet) => void
  setAccessionSheetOpen: (open: boolean) => void
  toggleGenomeTrack: () => void
  setGenomeDialogTarget: (target: GenomeDialogTarget | null) => void
  setBarcodeTarget: (target: BarcodeTarget | null) => void
  openVariantSearch: (interval?: [number, number]) => void
  closeVariantSearch: () => void
  setVariantSearching: (searching: boolean, error?: string | null) => void
  setVariantTableOpen: (open: boolean) => void
  setIntrogressionTarget: (target: IntrogressionTarget | null) => void
  requestIntrogressionClose: () => void
  setContextMenu: (menu: PlotPointerEvent | null) => void
  reset: () => void
}

const initialState = {
  toolbarSheet: "none" as ToolbarSheet,
  accessionSheetOpen: false,
  genomeTrackVisible: false,
  genomeDialogTarget: null,
  barcodeTarget: null,
  variantSearch: { open: false },
  variantSearching: false,
  variantSearchError: null,
  variantTableOpen: false,
  introgressionTarget: null,
  introgressionCloseRequest: 0,
  contextMenu: null,
}

export const useUiStore = create<UiState>()((set) => ({
  ...initialState,
  setToolbarSheet: (toolbarSheet) => set({ toolbarSheet }),
  // Opening accession selection or a dialog closes the toolbar sheet.
  setAccessionSheetOpen: (accessionSheetOpen) =>
    set((state) => ({
      accessionSheetOpen,
      toolbarSheet: accessionSheetOpen ? "none" : state.toolbarSheet,
    })),
  toggleGenomeTrack: () =>
    set((state) => ({ genomeTrackVisible: !state.genomeTrackVisible })),
  setGenomeDialogTarget: (genomeDialogTarget) =>
    set((state) => ({
      genomeDialogTarget,
      toolbarSheet: genomeDialogTarget ? "none" : state.toolbarSheet,
    })),
  setBarcodeTarget: (barcodeTarget) =>
    set((state) => ({
      barcodeTarget,
      toolbarSheet: barcodeTarget ? "none" : state.toolbarSheet,
    })),
  openVariantSearch: (interval) =>
    set({ variantSearch: { open: true, interval }, toolbarSheet: "none" }),
  closeVariantSearch: () => set({ variantSearch: { open: false } }),
  setVariantSearching: (variantSearching, error = null) =>
    set({ variantSearching, variantSearchError: error }),
  setVariantTableOpen: (variantTableOpen) => set({ variantTableOpen }),
  setIntrogressionTarget: (introgressionTarget) => set({ introgressionTarget }),
  requestIntrogressionClose: () =>
    set((state) => ({
      introgressionCloseRequest: state.introgressionCloseRequest + 1,
    })),
  setContextMenu: (contextMenu) => set({ contextMenu }),
  reset: () => set(initialState),
}))

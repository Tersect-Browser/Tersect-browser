import { create } from "zustand"

import type { PlotPointerEvent } from "@/lib/types"

export interface BarcodeTarget {
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

interface UiState {
  accessionSheetOpen: boolean
  genomeTrackVisible: boolean
  genomeDialogTarget: GenomeDialogTarget | null
  barcodeTarget: BarcodeTarget | null
  variantSearch: { open: boolean; interval?: [number, number] }
  introgressionTarget: IntrogressionTarget | null
  contextMenu: PlotPointerEvent | null

  setAccessionSheetOpen: (open: boolean) => void
  toggleGenomeTrack: () => void
  setGenomeDialogTarget: (target: GenomeDialogTarget | null) => void
  setBarcodeTarget: (target: BarcodeTarget | null) => void
  openVariantSearch: (interval?: [number, number]) => void
  closeVariantSearch: () => void
  setIntrogressionTarget: (target: IntrogressionTarget | null) => void
  setContextMenu: (menu: PlotPointerEvent | null) => void
  reset: () => void
}

const initialState = {
  accessionSheetOpen: false,
  genomeTrackVisible: false,
  genomeDialogTarget: null,
  barcodeTarget: null,
  variantSearch: { open: false },
  introgressionTarget: null,
  contextMenu: null,
}

export const useUiStore = create<UiState>()((set) => ({
  ...initialState,
  setAccessionSheetOpen: (accessionSheetOpen) => set({ accessionSheetOpen }),
  toggleGenomeTrack: () =>
    set((state) => ({ genomeTrackVisible: !state.genomeTrackVisible })),
  setGenomeDialogTarget: (genomeDialogTarget) => set({ genomeDialogTarget }),
  setBarcodeTarget: (barcodeTarget) => set({ barcodeTarget }),
  openVariantSearch: (interval) =>
    set({ variantSearch: { open: true, interval } }),
  closeVariantSearch: () => set({ variantSearch: { open: false } }),
  setIntrogressionTarget: (introgressionTarget) => set({ introgressionTarget }),
  setContextMenu: (contextMenu) => set({ contextMenu }),
  reset: () => set(initialState),
}))

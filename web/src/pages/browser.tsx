import { useQuery } from "@tanstack/react-query"
import { lazy, Suspense, useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router"

import { Spinner } from "@/components/ui/spinner"
import { AccessionSheet } from "@/features/accessions/accession-sheet"
import { BarcodeDialog } from "@/features/barcode/barcode-dialog"
import { IntrogressionPanel } from "@/features/introgression/introgression-panel"
import { DistancePlot } from "@/features/plot/distance-plot"
import { PlotContextMenu } from "@/features/plot/plot-context-menu"
import { PlotTooltip } from "@/features/plot/plot-tooltip"
import { StatusBar } from "@/features/plot/status-bar"
import { Toolbar } from "@/features/toolbar/toolbar"
import { VariantSearchDialog } from "@/features/variants/variant-search-dialog"
import { usePlotData } from "@/hooks/use-plot-data"
import {
  getAccessionNames,
  getChromosomes,
  getExportedSettings,
} from "@/lib/api"
import type { BrowserSettings, Chromosome, PlotPointerEvent } from "@/lib/types"
import {
  DEFAULT_BINSIZE,
  MIN_ZOOM_LEVEL,
  usePlotStore,
} from "@/store/plot-store"
import { useUiStore } from "@/store/ui-store"

// JBrowse is large and only needed once a genome view is opened.
const GenomeTrack = lazy(() =>
  import("@/features/jbrowse/genome-track").then((module) => ({
    default: module.GenomeTrack,
  }))
)
const GenomeDialog = lazy(() =>
  import("@/features/jbrowse/genome-dialog").then((module) => ({
    default: module.GenomeDialog,
  }))
)

/** Fill in whatever a saved view does not specify. */
function withDefaults(
  settings: BrowserSettings,
  accessions: string[],
  chromosomes: Chromosome[]
): BrowserSettings {
  const selectedAccessions = settings.selected_accessions ?? accessions
  const largestChromosome = chromosomes.reduce<Chromosome | undefined>(
    (largest, current) =>
      !largest || current.size > largest.size ? current : largest,
    undefined
  )
  const chromosome = settings.selected_chromosome ?? largestChromosome
  return {
    ...settings,
    accession_style: settings.accession_style ?? "labels",
    accession_groups: settings.accession_groups ?? [],
    selected_accessions: selectedAccessions,
    selected_reference: settings.selected_reference ?? selectedAccessions[0],
    selected_binsize: settings.selected_binsize ?? DEFAULT_BINSIZE,
    selected_chromosome: chromosome,
    zoom_level: settings.zoom_level ?? MIN_ZOOM_LEVEL,
    selected_interval:
      settings.selected_interval ??
      (chromosome ? [1, chromosome.size] : undefined),
    accession_infos:
      settings.accession_infos ??
      selectedAccessions.map((id) => ({ id, Label: id })),
    plugins: settings.plugins ?? [],
  }
}

/** The browser proper, once a view has been loaded into the store. */
function Browser() {
  const status = usePlotData()
  const [tooltip, setTooltip] = useState<PlotPointerEvent | null>(null)
  const genomeTrackVisible = useUiStore((state) => state.genomeTrackVisible)
  const genomeDialogOpen = useUiStore(
    (state) => state.genomeDialogTarget !== null
  )
  const setContextMenu = useUiStore((state) => state.setContextMenu)

  const plotReady = status.errors.length === 0 && status.loadMessage === ""

  return (
    <div className="flex h-full flex-col">
      <Toolbar plotReady={plotReady} />
      {genomeTrackVisible && (
        <Suspense
          fallback={
            <div className="px-3 py-2 text-xs text-muted-foreground">
              Loading genome track...
            </div>
          }
        >
          <GenomeTrack />
        </Suspense>
      )}
      <IntrogressionPanel />
      <div className="relative min-h-0 flex-1">
        <DistancePlot
          status={status}
          onClick={(event) => {
            setTooltip(null)
            setContextMenu(event)
          }}
          onHover={setTooltip}
          onMove={() => setTooltip(null)}
        />
      </div>
      <StatusBar />

      <PlotTooltip event={tooltip} />
      <PlotContextMenu />
      <AccessionSheet />
      <VariantSearchDialog />
      <BarcodeDialog />
      {genomeDialogOpen && (
        <Suspense fallback={null}>
          <GenomeDialog />
        </Suspense>
      )}
    </div>
  )
}

function LoadedView({ exportId }: { exportId: string }) {
  const navigate = useNavigate()
  const loaded = usePlotStore((state) => state.datasetId !== undefined)

  const view = useQuery({
    queryKey: ["view", exportId],
    queryFn: async ({ signal }) => {
      const settings = await getExportedSettings(exportId, signal)
      if (!settings) {
        return null
      }
      const [accessions, chromosomes] = await Promise.all([
        getAccessionNames(settings.dataset_id, signal),
        getChromosomes(settings.dataset_id, signal),
      ])
      return {
        settings: withDefaults(settings, accessions, chromosomes),
        chromosomes,
      }
    },
    staleTime: Infinity,
    gcTime: 0,
  })

  useEffect(() => {
    if (view.data === null) {
      // Unknown view
      void navigate("/", { replace: true })
    } else if (view.data) {
      usePlotStore
        .getState()
        .loadSettings(view.data.settings, view.data.chromosomes)
    }
  }, [view.data, navigate])

  useEffect(
    () => () => {
      usePlotStore.getState().reset()
      useUiStore.getState().reset()
    },
    []
  )

  if (view.isError) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-destructive">
        This view could not be loaded. Check that the backend is running.
      </div>
    )
  }
  if (!loaded) {
    return (
      <div
        className="flex h-full items-center justify-center gap-2 text-sm"
        role="status"
      >
        <Spinner />
        Loading view...
      </div>
    )
  }
  return <Browser />
}

export function BrowserPage() {
  const { exportId } = useParams()
  if (!exportId) {
    return null
  }
  return <LoadedView key={exportId} exportId={exportId} />
}

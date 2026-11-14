import {
  createViewState,
  JBrowseLinearGenomeView,
} from "@jbrowse/react-linear-genome-view2"
import { when } from "mobx"
import { useEffect, useState } from "react"

import { Spinner } from "@/components/ui/spinner"
import { usePlotStore } from "@/store/plot-store"

import { getConfiguration, type JBrowseDatasetConfig } from "./config"
import { useJBrowseConfig } from "./use-jbrowse-config"

type ViewState = ReturnType<typeof createViewState>

/** Height of the title bar JBrowse draws above an embedded view. */
const JBROWSE_TITLE_BAR_HEIGHT = 32

function Message({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-8 shrink-0 items-center gap-2 border-b bg-card px-3 text-muted-foreground">
      {children}
    </div>
  )
}

function GenomeTrackView({ config }: { config: JBrowseDatasetConfig }) {
  const chromosome = usePlotStore((state) => state.chromosome)
  const interval = usePlotStore((state) => state.interval)
  const binsize = usePlotStore((state) => state.binsize)
  const zoomLevel = usePlotStore((state) => state.zoomLevel)
  const plotPositionX = usePlotStore((state) => state.plotPosition.x)
  const paneWidth = usePlotStore((state) => state.treeWidth)

  const [viewState] = useState<ViewState>(() =>
    createViewState({
      assembly: config.assembly,
      tracks: config.tracks,
      configuration: getConfiguration(),
      defaultSession: {
        name: "default session",
        view: { type: "LinearGenomeView", id: "1", hideHeader: true },
      },
    })
  )
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    viewState.assemblyManager
      .waitForAssembly(config.assembly.name)
      .then((assembly: unknown) => {
        if (!assembly && !cancelled) {
          setFailed(true)
        }
      })
      .catch(() => !cancelled && setFailed(true))
    return () => {
      cancelled = true
    }
  }, [viewState, config.assembly.name])

  // Show the same region, at the same scale, as the heatmap below.
  useEffect(() => {
    const view = viewState.session.views[0]
    if (!view || !chromosome || !interval || !binsize) {
      return
    }
    return when(
      () => view.initialized,
      () => {
        view.setHideHeader(true)
        view.setTrackLabels("hidden")
        if (config.geneTrackId && !view.tracks.length) {
          view.showTrack(config.geneTrackId)
        }
        const region = view.displayedRegions[0]
        if (region?.refName !== chromosome.name) {
          view.setDisplayedRegions([
            {
              assemblyName: config.assembly.name,
              refName: chromosome.name,
              start: 0,
              end: chromosome.size,
            },
          ])
        }
        const bpPerPx = binsize / (zoomLevel / 100)
        // First base drawn at the left edge of the heatmap (0-based). The
        // plot position is the (negative) number of bins scrolled.
        const leftBp = interval[0] - 1 - plotPositionX * binsize
        view.setNewView(bpPerPx, leftBp / bpPerPx)
      }
    )
  }, [
    viewState,
    config,
    chromosome,
    interval,
    binsize,
    zoomLevel,
    plotPositionX,
  ])

  if (failed) {
    return (
      <Message>
        The genome track could not be loaded: the reference sequence of this
        dataset is not available.
      </Message>
    )
  }
  return (
    // Display only: it follows the plot, so it must not be panned on its own.
    <div
      className="pointer-events-none shrink-0 overflow-hidden border-b"
      style={{ marginLeft: paneWidth }}
    >
      {/* Shifted up to hide the title bar of the embedded view. */}
      <div style={{ marginTop: -JBROWSE_TITLE_BAR_HEIGHT }}>
        <JBrowseLinearGenomeView viewState={viewState} />
      </div>
    </div>
  )
}

/**
 * Gene model track drawn above the distance plot, at the same scale and
 * position as the heatmap so genes line up with the bins below.
 */
export function GenomeTrack() {
  const datasetId = usePlotStore((state) => state.datasetId)
  const config = useJBrowseConfig()

  if (config.isPending) {
    return (
      <Message>
        <Spinner className="size-3" />
        Loading genome track...
      </Message>
    )
  }
  if (!config.data) {
    return <Message>This dataset has no genome browser configuration.</Message>
  }
  return <GenomeTrackView key={datasetId} config={config.data} />
}

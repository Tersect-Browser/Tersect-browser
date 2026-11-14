import {
  createViewState,
  JBrowseLinearGenomeView,
} from "@jbrowse/react-linear-genome-view2"
import { DnaIcon, XIcon } from "lucide-react"
import { when } from "mobx"
import { useEffect, useState, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { usePlotStore } from "@/store/plot-store"
import { useUiStore } from "@/store/ui-store"

import type { JBrowseDatasetConfig } from "./config"
import { jbrowseConfiguration, styleTracks, type JBrowseTokens } from "./theme"
import { useJBrowseConfig, useJBrowseTokens } from "./use-jbrowse-config"

type ViewState = ReturnType<typeof createViewState>

/** Height of the strip (8.1). */
const STRIP_HEIGHT = 58
/**
 * JBrowse draws a header and a scale bar above the track; the strip shows
 * only the track, so the view is shifted up by their height.
 */
const JBROWSE_CHROME_HEIGHT = 50
/** Height of the gene track inside the strip. */
const TRACK_HEIGHT = 50

/** The strip: a label cell as wide as the accession pane, then the track. */
function StripFrame({
  annotation,
  children,
}: {
  annotation?: string
  children: ReactNode
}) {
  const paneWidth = usePlotStore((state) => state.treeWidth)
  const toggle = useUiStore((state) => state.toggleGenomeTrack)
  return (
    <div
      className="flex shrink-0 border-b bg-card"
      style={{ height: STRIP_HEIGHT }}
    >
      <div
        className="flex shrink-0 flex-col justify-between border-r py-[5px] pr-1.5 pl-2.5"
        style={{ width: paneWidth }}
      >
        <div className="flex items-center gap-[5px]">
          <DnaIcon className="size-3 text-muted-foreground" />
          <span className="font-semibold">Gene models</span>
          <Button
            variant="ghost"
            size="icon-xs"
            className="ml-auto text-muted-foreground"
            aria-label="Hide gene track"
            onClick={toggle}
          >
            <XIcon />
          </Button>
        </div>
        <span className="truncate font-mono text-[10px] text-muted-foreground">
          {annotation ? `${annotation} · ` : ""}locked to heatmap
        </span>
      </div>
      <div className="relative min-w-0 flex-1 overflow-hidden">{children}</div>
    </div>
  )
}

function LoadingOverlay({ children }: { children: ReactNode }) {
  return (
    <div className="absolute inset-0 z-10 flex items-center gap-1.5 bg-[color-mix(in_oklch,var(--card)_80%,transparent)] pl-3 text-muted-foreground">
      {children}
    </div>
  )
}

function GenomeTrackView({
  config,
  tokens,
}: {
  config: JBrowseDatasetConfig
  tokens: JBrowseTokens
}) {
  const chromosome = usePlotStore((state) => state.chromosome)
  const interval = usePlotStore((state) => state.interval)
  const binsize = usePlotStore((state) => state.binsize)
  const zoomLevel = usePlotStore((state) => state.zoomLevel)
  const plotPositionX = usePlotStore((state) => state.plotPosition.x)

  const [viewState] = useState<ViewState>(() =>
    createViewState({
      assembly: config.assembly,
      tracks: styleTracks(config.tracks, tokens, { compact: true }).map(
        (track) =>
          track.trackId === config.geneTrackId
            ? {
                ...track,
                displays: track.displays?.map((display: object) => ({
                  ...display,
                  height: TRACK_HEIGHT,
                  // The strip shows gene density at chromosome scale, where
                  // JBrowse would otherwise ask to zoom in.
                  maxFeatureScreenDensity: 1000,
                  fetchSizeLimit: 200_000_000,
                })),
              }
            : track
      ),
      configuration: jbrowseConfiguration(tokens),
      defaultSession: {
        name: "default session",
        view: { type: "LinearGenomeView", id: "1", hideHeader: true },
      },
    })
  )
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading")

  useEffect(() => {
    let cancelled = false
    viewState.assemblyManager
      .waitForAssembly(config.assembly.name)
      .then((assembly: unknown) => {
        if (!cancelled && !assembly) {
          setState("failed")
        }
      })
      .catch(() => !cancelled && setState("failed"))
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
        // The heatmap below already provides the grid.
        view.setShowGridlines(false)
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
        setState((current) => (current === "failed" ? current : "ready"))
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

  if (state === "failed") {
    return (
      <LoadingOverlay>
        The gene models could not be loaded: the reference sequence of this
        dataset is not available.
      </LoadingOverlay>
    )
  }
  return (
    <>
      {state === "loading" && (
        <LoadingOverlay>
          <Spinner className="size-3" />
          Loading gene models…
        </LoadingOverlay>
      )}
      {/* Display only: it follows the plot, so it is not panned on its own.
          JBrowse insets the view by a 2px margin and 4px padding; removed so
          the first base sits exactly over the first bin. */}
      <div
        className="pointer-events-none [&_.MuiScopedCssBaseline-root>.MuiPaper-root]:m-0! [&_.MuiScopedCssBaseline-root>.MuiPaper-root]:p-0!"
        style={{ marginTop: -JBROWSE_CHROME_HEIGHT }}
      >
        <JBrowseLinearGenomeView viewState={viewState} />
      </div>
    </>
  )
}

/**
 * Gene model track drawn above the distance plot, at the same scale and
 * position as the heatmap so genes line up with the bins below.
 */
export function GenomeTrack() {
  const datasetId = usePlotStore((state) => state.datasetId)
  const config = useJBrowseConfig()
  const tokens = useJBrowseTokens()

  if (config.isPending) {
    return (
      <StripFrame>
        <LoadingOverlay>
          <Spinner className="size-3" />
          Loading gene models…
        </LoadingOverlay>
      </StripFrame>
    )
  }
  if (!config.data) {
    return (
      <StripFrame>
        <LoadingOverlay>
          This dataset has no reference sequence, so there are no gene models to
          show.
        </LoadingOverlay>
      </StripFrame>
    )
  }
  return (
    <StripFrame annotation={config.data.annotation}>
      {/* Rebuilt when the theme changes, so JBrowse follows the page. */}
      <GenomeTrackView
        key={`${datasetId}:${tokens.dark}:${tokens.primary}`}
        config={config.data}
        tokens={tokens}
      />
    </StripFrame>
  )
}

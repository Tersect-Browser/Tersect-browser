import {
  createViewState,
  JBrowseLinearGenomeView,
} from "@jbrowse/react-linear-genome-view2"
import { ScanSearchIcon } from "lucide-react"
import { when } from "mobx"
import { useEffect, useState } from "react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { usePlotStore } from "@/store/plot-store"
import { useUiStore, type GenomeDialogTarget } from "@/store/ui-store"

import type { JBrowseDatasetConfig } from "./config"
import { jbrowseConfiguration, styleTracks, type JBrowseTokens } from "./theme"
import { useJBrowseConfig, useJBrowseTokens } from "./use-jbrowse-config"

type ViewState = ReturnType<typeof createViewState>

/** Region shown when the dialog opens for a whole accession, in bp. */
const DEFAULT_SPAN = 100_000

function AccessionGenomeView({
  target,
  config,
  tokens,
}: {
  target: GenomeDialogTarget
  config: JBrowseDatasetConfig
  tokens: JBrowseTokens
}) {
  const [viewState] = useState<ViewState>(() => {
    const chromosome = usePlotStore.getState().chromosome
    return createViewState({
      assembly: config.assembly,
      tracks: styleTracks(config.tracks, tokens),
      configuration: jbrowseConfiguration(tokens),
      defaultSession: {
        name: "default session",
        view: {
          type: "LinearGenomeView",
          id: "1",
          displayedRegions: chromosome
            ? [
                {
                  assemblyName: config.assembly.name,
                  refName: chromosome.name,
                  start: 0,
                  end: chromosome.size,
                },
              ]
            : [],
        },
      },
    })
  })

  useEffect(() => {
    const chromosome = usePlotStore.getState().chromosome
    const view = viewState.session.views[0]
    if (!chromosome || !view) {
      return
    }
    // Tracks can only be shown once the view knows its width.
    return when(
      () => view.initialized,
      () => {
        const variantTrack = config.tracks.find(
          (track) =>
            track.trackId === target.accession ||
            track.trackId === target.accessionName
        )
        view.showTrack(config.assembly.sequence.trackId)
        if (config.geneTrackId) {
          view.showTrack(config.geneTrackId)
        }
        if (variantTrack) {
          view.showTrack(variantTrack.trackId)
        }
        // From a label: the start of the plotted interval.
        const plotStart = usePlotStore.getState().interval?.[0] ?? 1
        const [start, end] = target.interval ?? [
          plotStart,
          Math.min(plotStart + DEFAULT_SPAN, chromosome.size),
        ]
        void view.navToLocString(
          `${chromosome.name}:${start}..${end}`,
          config.assembly.name
        )
      }
    )
  }, [viewState, config, target])

  return <JBrowseLinearGenomeView viewState={viewState} />
}

function DialogBody({ target }: { target: GenomeDialogTarget }) {
  const config = useJBrowseConfig()
  const tokens = useJBrowseTokens()
  if (config.isPending) {
    return (
      <div className="flex items-center gap-2 p-4 text-muted-foreground">
        <Spinner className="size-3" />
        Loading genome browser…
      </div>
    )
  }
  if (!config.data) {
    return (
      <p className="p-4 text-muted-foreground">
        This dataset has no genome browser configuration.
      </p>
    )
  }
  return (
    <div
      // JBrowse pans its tracks sideways itself; vertical drags are left to
      // the dialog's own scroll.
      className="touch-pan-y overflow-hidden rounded-xl border bg-card"
    >
      {/* Rebuilt when the theme changes, so JBrowse follows the page. */}
      <AccessionGenomeView
        key={`${tokens.dark}:${tokens.primary}`}
        target={target}
        config={config.data}
        tokens={tokens}
      />
    </div>
  )
}

/** Genome browser for one accession: sequence, gene models and its variants. */
export function GenomeDialog() {
  const target = useUiStore((state) => state.genomeDialogTarget)
  const setTarget = useUiStore((state) => state.setGenomeDialogTarget)

  return (
    // Not modal: JBrowse opens its menus, track selector and dialogs in
    // Material UI portals on <body>, outside the dialog content. A modal Radix
    // dialog turns pointer events off for everything outside its content and
    // pulls focus back into it, which leaves those menus dead.
    <Dialog
      modal={false}
      open={target !== null}
      onOpenChange={(open) => !open && setTarget(null)}
    >
      {/* Radix draws no overlay for a non-modal dialog. */}
      <DialogPortal>
        <div
          data-genome-backdrop
          className="fixed inset-0 z-50 animate-in bg-black/45 duration-100 fade-in-0"
        />
      </DialogPortal>
      <DialogContent
        // Phones: the full width of the screen (HANDOFF-mobile 6).
        className="max-h-[90vh] w-[80vw] overflow-auto overscroll-contain max-sm:right-0! max-sm:left-0! max-sm:rounded-b-none sm:max-w-none"
        // JBrowse's portals count as outside: only the backdrop dismisses.
        onInteractOutside={(event) => {
          const element = event.target as Element | null
          if (!element?.closest?.("[data-genome-backdrop]")) {
            event.preventDefault()
          }
        }}
        // Escape closes an open JBrowse menu or dialog first.
        onEscapeKeyDown={(event) => {
          if (document.querySelector(".MuiModal-root")) {
            event.preventDefault()
          }
        }}
      >
        <DialogHeader className="flex-row items-center gap-2 pr-8">
          <ScanSearchIcon className="size-3.5 text-muted-foreground" />
          <DialogTitle className="font-mono">
            {target?.accessionName}
          </DialogTitle>
          <DialogDescription>Genome browser</DialogDescription>
        </DialogHeader>
        {target && (
          <DialogBody
            key={`${target.accession}:${target.interval?.join("-")}`}
            target={target}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

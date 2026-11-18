import { useCallback, useEffect, useRef, useState } from "react"

import {
  introgressionEventsUrl,
  startIntrogressionScan,
  type IntrogressionRequest,
} from "@/lib/api"
import { toSameOrigin } from "@/lib/config"

import type { PhylonetResult, ScanResponse } from "./types"

interface RunState {
  /** The window scan is running. */
  loading: boolean
  /** The scan has finished and the PhyloNet analysis is running. */
  phylonetLoading: boolean
  /** Latest progress message from the server. */
  status: string
  /** Current stage (index into JOB_STAGES); JOB_STAGES.length when done. */
  stage: number
  /** Stage at which the job failed, if it did. */
  failedStage: number | null
  error: string | null
  scan: ScanResponse | null
  phylonet: PhylonetResult | null
}

const idle: RunState = {
  loading: false,
  phylonetLoading: false,
  status: "",
  stage: 0,
  failedStage: null,
  error: null,
  scan: null,
  phylonet: null,
}

interface PipelineMessage {
  stage?: string
  message?: string
  type?: string
  data?: unknown
}

/** Stage a server status message belongs to; undefined if unknown. */
function stageOf(message: string): number | undefined {
  const text = message.toLowerCase()
  if (text.includes("species tree") || text.includes("analysis started")) {
    return 0
  }
  if (text.includes("gene tree generation completed")) {
    return 2
  }
  if (text.includes("gene tree")) {
    return 1
  }
  if (text.includes("phylonet")) {
    return 3
  }
  return undefined
}

function parse(event: MessageEvent): PipelineMessage {
  try {
    return JSON.parse(event.data as string) as PipelineMessage
  } catch {
    return {}
  }
}

/**
 * Runs an introgression analysis. The server answers the request immediately
 * and then reports progress and results over a server-sent event stream.
 */
export function useIntrogressionRun() {
  const [state, setState] = useState<RunState>(idle)
  const stream = useRef<EventSource | null>(null)

  const closeStream = useCallback(() => {
    stream.current?.close()
    stream.current = null
  }, [])

  useEffect(() => closeStream, [closeStream])

  const start = useCallback(
    async (request: IntrogressionRequest) => {
      closeStream()
      setState({ ...idle, loading: true, status: "Starting analysis" })
      const update = (patch: Partial<RunState>) =>
        setState((current) => ({ ...current, ...patch }))
      // Unknown messages update the status line only.
      const progress = (text: string) =>
        setState((current) => ({
          ...current,
          status: text,
          stage: Math.max(current.stage, stageOf(text) ?? current.stage),
        }))

      try {
        const response = await startIntrogressionScan(request)
        const datasetId = response.datasetId ?? request.datasetId
        if (!response.accKey) {
          throw new Error("The server did not start the analysis")
        }

        const events = new EventSource(
          introgressionEventsUrl(datasetId, response.accKey)
        )
        stream.current = events
        const on = (
          type: string,
          handler: (message: PipelineMessage) => void
        ) => events.addEventListener(type, (event) => handler(parse(event)))

        on("pipeline:start", (message) => progress(message.message ?? ""))
        on("pipeline:progress", (message) => progress(message.message ?? ""))
        on("introgression:result", (message) => {
          if (message.type === "topology_scan") {
            update({
              loading: false,
              phylonetLoading: true,
              status: "Window scan complete; PhyloNet analysis running",
              stage: 3,
              scan: message.data as ScanResponse,
            })
          } else if (message.type === "phylonet_result") {
            const result = (message.data ?? {}) as PhylonetResult
            update({
              loading: false,
              phylonetLoading: false,
              stage: 4,
              phylonet: {
                phyloText: result.phyloText && toSameOrigin(result.phyloText),
                phyloPlot: result.phyloPlot && toSameOrigin(result.phyloPlot),
                phyloIntroPlot:
                  result.phyloIntroPlot && toSameOrigin(result.phyloIntroPlot),
              },
            })
          }
        })
        on("pipeline:done", () => {
          update({
            loading: false,
            phylonetLoading: false,
            stage: 4,
            status: "All analyses completed",
          })
          closeStream()
        })
        on("pipeline:error", (message) => {
          setState((current) => ({
            ...current,
            loading: false,
            phylonetLoading: false,
            failedStage: current.stage,
            status: `Stopped at stage ${current.stage + 1} of 4`,
            error: message.message ?? "Pipeline error",
          }))
          if (message.stage === "fatal") {
            closeStream()
          }
        })
        events.onerror = () => {
          // The browser reconnects by itself; only report a closed stream.
          if (events.readyState === EventSource.CLOSED) {
            update({
              loading: false,
              phylonetLoading: false,
              error: "Connection to the server was lost",
            })
          }
        }
      } catch (error) {
        update({
          loading: false,
          error:
            error instanceof Error ? error.message : "Failed to run analysis.",
        })
      }
    },
    [closeStream]
  )

  const clear = useCallback(() => {
    closeStream()
    setState(idle)
  }, [closeStream])

  return { ...state, start, clear }
}

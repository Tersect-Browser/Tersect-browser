import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"

import { buildEventsUrl, buildQuery } from "../api"
import { BUILD_STAGES, type Build, type BuildStatus, type StageKey } from "../types"

export const isLive = (status: BuildStatus | undefined) =>
  status === "queued" || status === "running"

/**
 * One build, kept current by the server's event stream: each `build` event
 * carries the whole Build and replaces the cached copy. The stream is open
 * only while the build is queued or running.
 */
export function useBuild(buildId: string) {
  const queryClient = useQueryClient()
  const query = useQuery(buildQuery(buildId))
  const live = isLive(query.data?.status)

  useEffect(() => {
    if (!live) return
    const source = new EventSource(buildEventsUrl(buildId))
    source.addEventListener("build", (event) => {
      const build = JSON.parse((event as MessageEvent<string>).data) as Build
      queryClient.setQueryData(buildQuery(buildId).queryKey, build)
      if (!isLive(build.status)) {
        source.close()
        // Home and Builds show this build's outcome.
        void queryClient.invalidateQueries({ queryKey: ["builder", "datasets"] })
        void queryClient.invalidateQueries({ queryKey: ["builder", "builds"], exact: true })
        void queryClient.invalidateQueries({ queryKey: ["datasets"] })
      }
    })
    return () => source.close()
  }, [buildId, live, queryClient])

  return query
}

/**
 * Seconds to add to the server's elapsed times: how long ago the build was
 * last received. Ticks every second while the build runs.
 */
export function useTick(running: boolean, receivedAt: number): number {
  const [now, setNow] = useState(receivedAt)
  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [running])
  return running ? Math.max(0, (now - receivedAt) / 1000) : 0
}

export const stageName = (key: StageKey | undefined) =>
  BUILD_STAGES.find((stage) => stage.key === key)?.name ?? "the build"

/** The stage a build is at: active, failed or cancelled. */
export function currentStage(build: Build) {
  if (build.error) return build.stages.find((s) => s.key === build.error?.stage)
  return build.stages.find(
    (s) => s.status === "active" || s.status === "failed" || s.status === "cancelled"
  )
}

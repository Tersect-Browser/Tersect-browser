import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"

import { useVizTokens } from "@/hooks/use-viz-tokens"

import { usePlotStore } from "@/store/plot-store"

import { loadJBrowseConfig } from "./config"
import { readJBrowseTokens, type JBrowseTokens } from "./theme"

/** Genome browser configuration of the dataset being viewed. */
export function useJBrowseConfig() {
  const datasetId = usePlotStore((state) => state.datasetId)
  return useQuery({
    queryKey: ["jbrowse-config", datasetId],
    queryFn: () => loadJBrowseConfig(datasetId!),
    enabled: datasetId !== undefined,
    staleTime: Infinity,
  })
}

/**
 * Design tokens for JBrowse, re-read when the page theme changes; views are
 * rebuilt from them so JBrowse switches theme with the page.
 */
export function useJBrowseTokens(): JBrowseTokens {
  const vizTokens = useVizTokens()
  return useMemo(() => {
    void vizTokens // a new object marks a theme change
    return readJBrowseTokens()
  }, [vizTokens])
}

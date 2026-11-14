import { useQuery } from "@tanstack/react-query"

import { usePlotStore } from "@/store/plot-store"

import { loadJBrowseConfig } from "./config"

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

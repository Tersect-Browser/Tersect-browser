import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { useEffect, useMemo } from "react"

import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { getChromosomeGaps, getDistanceBins, getNewickTree } from "@/lib/api"
import { sameElements } from "@/lib/genome"
import type { Chromosome, DistanceBins, NewickTree } from "@/lib/types"
import { usePlotStore } from "@/store/plot-store"

const DEBOUNCE_TIME = 700
const TREE_RETRY_DELAY = 1000
const DEFAULT_LOAD_MESSAGE = "Loading..."

/** The backend reports a failed tree build as a status starting with this. */
const isTreeFailure = (status: string | undefined) =>
  status?.startsWith("Error") ?? false

export const ERROR_MESSAGE_ACCESSIONS =
  "At least two accessions must be selected"
export const ERROR_MESSAGE_BINSIZE =
  "Bin size must be smaller than the selected interval"

interface PlotInputs {
  datasetId: string
  reference: string
  chromosome: Chromosome
  interval: [number, number]
  binsize: number
  accessions: string[]
}

function validate(inputs: PlotInputs): string[] {
  const errors: string[] = []
  if (inputs.accessions.length < 2) {
    errors.push(ERROR_MESSAGE_ACCESSIONS)
  }
  const [start, end] = inputs.interval
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    end - start < inputs.binsize
  ) {
    errors.push(ERROR_MESSAGE_BINSIZE)
  }
  return errors
}

/** Do the distance bins and the tree describe the same region and accessions? */
function binsMatchTree(
  bins: DistanceBins,
  tree: NewickTree,
  inputs: PlotInputs
): boolean {
  return (
    bins.query.chromosome_name === tree.query.chromosomeName &&
    bins.query.chromosome_name === inputs.chromosome.name &&
    bins.query.interval[0] === tree.query.interval[0] &&
    bins.query.interval[1] === tree.query.interval[1] &&
    bins.query.reference === inputs.reference &&
    sameElements(bins.query.accessions, tree.query.accessions)
  )
}

export interface PlotDataStatus {
  /** Validation or request errors; these take priority over loading. */
  errors: string[]
  /** Non-empty while the plot for the current settings is being prepared. */
  loadMessage: string
}

/**
 * Loads the data behind the distance plot (distance bins, phenetic tree and
 * sequence gaps) whenever the view settings change, and commits it to the
 * store once all three agree with each other.
 */
export function usePlotData(): PlotDataStatus {
  const datasetId = usePlotStore((state) => state.datasetId)
  const reference = usePlotStore((state) => state.reference)
  const chromosome = usePlotStore((state) => state.chromosome)
  const interval = usePlotStore((state) => state.interval)
  const binsize = usePlotStore((state) => state.binsize)
  const accessions = usePlotStore((state) => state.accessions)
  const committedBins = usePlotStore((state) => state.distanceBins)
  const commitPlot = usePlotStore((state) => state.commitPlot)

  const inputs = useMemo<PlotInputs | null>(() => {
    if (
      datasetId === undefined ||
      reference === undefined ||
      chromosome === undefined ||
      interval === undefined ||
      binsize === undefined ||
      accessions === undefined
    ) {
      return null
    }
    return { datasetId, reference, chromosome, interval, binsize, accessions }
  }, [datasetId, reference, chromosome, interval, binsize, accessions])

  const debounced = useDebouncedValue(inputs, DEBOUNCE_TIME)
  const errors = useMemo(() => (inputs ? validate(inputs) : []), [inputs])
  const ready =
    debounced !== null && debounced === inputs && errors.length === 0

  const gaps = useQuery({
    queryKey: ["gaps", debounced?.datasetId, debounced?.chromosome.name],
    queryFn: ({ signal }) =>
      getChromosomeGaps(
        debounced!.datasetId,
        debounced!.chromosome.name,
        signal
      ),
    enabled: ready,
    staleTime: Infinity,
  })

  const bins = useQuery({
    queryKey: [
      "bins",
      debounced?.datasetId,
      debounced?.reference,
      debounced?.chromosome.name,
      debounced?.interval,
      debounced?.binsize,
      debounced?.accessions,
    ],
    queryFn: ({ signal }) =>
      getDistanceBins(
        debounced!.datasetId,
        {
          reference: debounced!.reference,
          chromosome_name: debounced!.chromosome.name,
          interval: debounced!.interval,
          binsize: debounced!.binsize,
          accessions: debounced!.accessions,
        },
        signal
      ),
    enabled: ready,
    staleTime: Infinity,
    gcTime: 60_000,
    placeholderData: keepPreviousData,
    retry: false,
  })

  const tree = useQuery({
    queryKey: [
      "tree",
      debounced?.datasetId,
      debounced?.chromosome.name,
      debounced?.interval,
      debounced?.accessions,
    ],
    queryFn: ({ signal }) =>
      getNewickTree(
        debounced!.datasetId,
        {
          chromosomeName: debounced!.chromosome.name,
          interval: debounced!.interval,
          accessions: debounced!.accessions,
        },
        signal
      ),
    enabled: ready,
    // Trees are built in the background; poll until this one is ready.
    refetchInterval: (query) =>
      query.state.data?.status === "ready" ||
      isTreeFailure(query.state.data?.status) ||
      query.state.error
        ? false
        : TREE_RETRY_DELAY,
    staleTime: Infinity,
    gcTime: 60_000,
    retry: false,
  })

  const treeReady = tree.data?.status === "ready"

  useEffect(() => {
    if (
      ready &&
      inputs &&
      bins.data &&
      !bins.isPlaceholderData &&
      tree.data &&
      treeReady &&
      gaps.data &&
      binsMatchTree(bins.data, tree.data, inputs)
    ) {
      commitPlot(bins.data, tree.data, gaps.data)
    }
  }, [
    ready,
    inputs,
    bins.data,
    bins.isPlaceholderData,
    tree.data,
    treeReady,
    gaps.data,
    commitPlot,
  ])

  if (!inputs) {
    return { errors: [], loadMessage: DEFAULT_LOAD_MESSAGE }
  }
  if (errors.length) {
    return { errors, loadMessage: "" }
  }

  const requestError = bins.error ?? tree.error ?? gaps.error
  if (ready && requestError) {
    return { errors: [requestError.message], loadMessage: "" }
  }
  if (ready && tree.data && isTreeFailure(tree.data.status)) {
    return { errors: [tree.data.status], loadMessage: "" }
  }

  const upToDate =
    ready &&
    bins.data !== undefined &&
    !bins.isPlaceholderData &&
    committedBins === bins.data
  if (upToDate) {
    return { errors: [], loadMessage: "" }
  }
  const treeStatus =
    ready && tree.data && !treeReady ? tree.data.status : undefined
  return { errors: [], loadMessage: treeStatus || DEFAULT_LOAD_MESSAGE }
}

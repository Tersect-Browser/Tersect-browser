import { DATAFILES_URL, toSameOrigin } from "@/lib/config"

/* eslint-disable @typescript-eslint/no-explicit-any -- JBrowse configuration
   is plain JSON whose shape is defined by JBrowse. */
export interface JBrowseDatasetConfig {
  assembly: any
  tracks: any[]
  /** The gene model track, shown under the ruler and in every dialog. */
  geneTrackId: string | undefined
  /** Name of the gene annotation, e.g. ITAG2.4_gene_models. */
  annotation?: string
}

/**
 * Rewrite file locations so they load from this app's origin:
 * absolute URLs keep their path, and relative ones are taken relative to the
 * dataset files the backend serves.
 */
function relocate<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(relocate) as T
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        key === "uri" && typeof entry === "string"
          ? /^[a-z]+:|^\//i.test(entry)
            ? toSameOrigin(entry)
            : toSameOrigin(`${DATAFILES_URL}/${entry}`)
          : relocate(entry),
      ])
    ) as T
  }
  return value
}

/** File-name-safe version of a dataset id; matches the pipeline (manifest.slug). */
function slug(text: string): string {
  return text.replace(/[^A-Za-z0-9._-]+/g, "_")
}

/**
 * Genome browser configuration of a dataset, as written by the dataset
 * pipeline, or null for a dataset without a reference sequence.
 */
export async function loadJBrowseConfig(
  datasetId: string
): Promise<JBrowseDatasetConfig | null> {
  const response = await fetch(
    `${DATAFILES_URL}/jbrowse/${encodeURIComponent(slug(datasetId))}.json`
  )
  if (response.status === 404) {
    return null
  }
  if (!response.ok) {
    throw new Error(`Genome browser configuration: ${response.status}`)
  }
  const config = (await response.json()) as JBrowseDatasetConfig
  return {
    assembly: relocate(config.assembly),
    tracks: relocate(config.tracks ?? []),
    geneTrackId: config.geneTrackId ?? undefined,
    annotation: config.annotation ?? undefined,
  }
}

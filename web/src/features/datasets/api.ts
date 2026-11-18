/**
 * Client for the builder service (/api). See ./types.ts for the shapes and
 * pipeline/tbpipeline/server for the implementation.
 */
import { queryOptions } from "@tanstack/react-query"

import { BUILDER_API_URL } from "@/lib/config"

import type {
  Build,
  BuilderConfig,
  DatasetFiles,
  Draft,
  FileKind,
  FileRef,
  InspectResult,
  ManagedDataset,
  ManifestInput,
  ServerFolder,
  StorageInfo,
  UrlCheck,
  ValidationIssue,
} from "./types"

export const UPLOADS_URL = `${BUILDER_API_URL}/uploads`

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BUILDER_API_URL}${path}`, init)
  const text = await response.text()
  if (!response.ok) {
    // FastAPI errors are { detail: string | [...] }.
    let message = text || `Request failed (${response.status})`
    try {
      const body = JSON.parse(text)
      if (typeof body?.detail === "string") message = body.detail
    } catch {
      /* plain text */
    }
    throw new ApiError(message, response.status)
  }
  return (text ? JSON.parse(text) : undefined) as T
}

function send<T>(
  method: string,
  path: string,
  body?: unknown,
  signal?: AbortSignal
): Promise<T> {
  return request<T>(path, {
    method,
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  })
}

/* ------------------------------------------------------------ server -- */

export const getConfig = () => request<BuilderConfig>("/config")
export const getStorage = () => request<StorageInfo>("/storage")

export const configQuery = queryOptions({
  queryKey: ["builder", "config"],
  queryFn: getConfig,
  staleTime: Infinity,
  // The builder may not be running; the app works without it.
  retry: false,
})

export const storageQuery = queryOptions({
  queryKey: ["builder", "storage"],
  queryFn: getStorage,
  refetchInterval: 30_000,
})

/* ------------------------------------------------------------- files -- */

export function inspectFile(
  file: FileRef,
  kind: FileKind,
  signal?: AbortSignal
) {
  return send<InspectResult>(
    "POST",
    "/datasets/inspect",
    { file, kind },
    signal
  )
}

export function checkUrls(urls: string[], signal?: AbortSignal) {
  return send<UrlCheck[]>("POST", "/datasets/check-urls", { urls }, signal)
}

export function listServerFolder(path: string, signal?: AbortSignal) {
  return request<ServerFolder>(
    `/server-files?${new URLSearchParams({ path })}`,
    { signal }
  )
}

export function deleteUpload(uploadId: string) {
  return send<void>("DELETE", `/uploads/${encodeURIComponent(uploadId)}`)
}

/* ---------------------------------------------------------- manifest -- */

export async function validateManifest(
  manifest: ManifestInput,
  signal?: AbortSignal
): Promise<ValidationIssue[]> {
  const result = await send<{ errors: ValidationIssue[] }>(
    "POST",
    "/datasets/validate",
    { manifest },
    signal
  )
  return result.errors
}

/** The manifest as YAML, as `tb-dataset` reads it. */
export async function manifestYaml(manifest: ManifestInput): Promise<string> {
  const response = await fetch(`${BUILDER_API_URL}/datasets/manifest.yaml`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ manifest }),
  })
  if (!response.ok) throw new ApiError(await response.text(), response.status)
  return response.text()
}

/** Download URL of the manifest a dataset was last built from. */
export const datasetManifestUrl = (datasetId: string) =>
  `${BUILDER_API_URL}/datasets/${encodeURIComponent(datasetId)}/manifest.yaml`

export const buildManifestUrl = (buildId: string) =>
  `${BUILDER_API_URL}/builds/${encodeURIComponent(buildId)}/manifest.yaml`

/* ---------------------------------------------------------- datasets -- */

export const datasetsQuery = queryOptions({
  queryKey: ["builder", "datasets"],
  queryFn: ({ signal }) => request<ManagedDataset[]>("/datasets", { signal }),
  // Building rows show progress.
  refetchInterval: (query) =>
    query.state.data?.some((d) => d.status === "building") ? 5000 : false,
  retry: false,
})

/** Show a published dataset in, or hide it from, the public dataset list. */
export function setDatasetListed(datasetId: string, listed: boolean) {
  return send<{ id: string; listed: boolean }>(
    "PATCH",
    `/datasets/${encodeURIComponent(datasetId)}`,
    { listed }
  )
}

/** What deleting the dataset with its files would free on the server. */
export const datasetFilesQuery = (datasetId: string) =>
  queryOptions({
    queryKey: ["builder", "datasets", datasetId, "files"],
    queryFn: ({ signal }) =>
      request<DatasetFiles>(
        `/datasets/${encodeURIComponent(datasetId)}/files`,
        {
          signal,
        }
      ),
    staleTime: 0,
  })

/**
 * Remove a dataset from the browser. With `files`, the server also deletes
 * what only this dataset uses: its published and build files, and its own
 * downloads and uploads. Files in server folders are never deleted.
 */
export function deleteDataset(datasetId: string, files: boolean) {
  return send<{ freed: number }>(
    "DELETE",
    `/datasets/${encodeURIComponent(datasetId)}?files=${files ? "true" : "false"}`
  )
}

/** Start a draft in add mode for a published dataset; returns the draft. */
export function addAccessionsDraft(datasetId: string) {
  return send<Draft>("POST", `/datasets/${encodeURIComponent(datasetId)}/add`)
}

/** Rebuild a dataset from the manifest it was last built from. */
export function rebuildDataset(datasetId: string) {
  return send<{ id: string }>(
    "POST",
    `/datasets/${encodeURIComponent(datasetId)}/rebuild`
  )
}

/* ------------------------------------------------------------ drafts -- */

export const draftsQuery = queryOptions({
  queryKey: ["builder", "drafts"],
  queryFn: ({ signal }) => request<Draft[]>("/drafts", { signal }),
  retry: false,
})

export const draftQuery = (draftId: string) =>
  queryOptions({
    queryKey: ["builder", "drafts", draftId],
    queryFn: ({ signal }) =>
      request<Draft>(`/drafts/${encodeURIComponent(draftId)}`, { signal }),
    staleTime: Infinity,
  })

export const createDraft = (draft: Omit<Draft, "id" | "updated_at">) =>
  send<Draft>("POST", "/drafts", draft)

export const saveDraft = (draft: Draft) =>
  send<Draft>("PUT", `/drafts/${encodeURIComponent(draft.id)}`, draft)

export const deleteDraft = (draftId: string) =>
  send<void>("DELETE", `/drafts/${encodeURIComponent(draftId)}`)

/* ------------------------------------------------------------ builds -- */

export const buildsQuery = queryOptions({
  queryKey: ["builder", "builds"],
  queryFn: ({ signal }) => request<Build[]>("/builds", { signal }),
  refetchInterval: (query) =>
    query.state.data?.some(
      (b) => b.status === "running" || b.status === "queued"
    )
      ? 5000
      : false,
})

export const buildQuery = (buildId: string) =>
  queryOptions({
    queryKey: ["builder", "builds", buildId],
    queryFn: ({ signal }) =>
      request<Build>(`/builds/${encodeURIComponent(buildId)}`, { signal }),
  })

/** Server-sent events: one `build` event with the whole Build per change. */
export const buildEventsUrl = (buildId: string) =>
  `${BUILDER_API_URL}/builds/${encodeURIComponent(buildId)}/events`

export function startBuild(
  manifest: ManifestInput,
  draftId?: string,
  rebuildOf?: string
) {
  return send<{ id: string }>("POST", "/builds", {
    manifest,
    draft_id: draftId ?? null,
    rebuild_of: rebuildOf ?? null,
  })
}

export const cancelBuild = (buildId: string) =>
  send<Build>("POST", `/builds/${encodeURIComponent(buildId)}/cancel`)

/** Resumes: finished steps are kept by Snakemake. */
export const retryBuild = (buildId: string) =>
  send<Build>("POST", `/builds/${encodeURIComponent(buildId)}/retry`)

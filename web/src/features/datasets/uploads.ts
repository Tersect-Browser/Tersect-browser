/**
 * Resumable uploads (tus protocol, POST /api/uploads).
 *
 * tus-js-client stores each upload's URL in localStorage keyed by the file's
 * fingerprint, so picking the same file again after a reload or a closed tab
 * resumes where it stopped. Uploads continue while the user moves between
 * steps; the Build button waits for them.
 *
 * Browsers cannot reopen a file after a reload, so an upload interrupted by a
 * reload shows as "paused" with "Choose the file again to resume".
 */
import { Upload } from "tus-js-client"
import { create } from "zustand"

import { deleteUpload, UPLOADS_URL } from "./api"
import type { FileRef } from "./types"

export type UploadStatus =
  | "uploading"
  | "paused"
  | "failed"
  /** Server has the whole file and verified its checksum. */
  | "verified"
  /** Reloaded: the browser needs the file picked again to resume. */
  | "needs-file"

export interface UploadItem {
  /** tus upload id once created (also FileRef.location). */
  uploadId: string | null
  /** Client key, stable across the item's life. */
  key: string
  name: string
  size: number
  sent: number
  /** Bytes per second, smoothed. */
  speed: number
  status: UploadStatus
  error: string | null
  /** Draft the upload belongs to. */
  draftId: string
}

interface Live {
  upload: Upload
  file: File
  lastBytes: number
  lastTime: number
}

const live = new Map<string, Live>()

interface UploadsState {
  items: Record<string, UploadItem>
  /** Start (or resume) uploading a file. Resolves with its FileRef once created. */
  add: (file: File, draftId: string) => Promise<{ key: string; ref: FileRef }>
  pause: (key: string) => void
  resume: (key: string, file?: File) => void
  /** Stop and delete the upload on the server. */
  remove: (key: string) => void
}

const STORAGE_KEY = "tb-uploads"

function loadSaved(): Record<string, UploadItem> {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<
      string,
      UploadItem
    >
    for (const item of Object.values(saved)) {
      // Nothing is live after a reload: an interrupted or failed upload
      // needs the file picked again before it can resume.
      if (item.status !== "verified") {
        item.status = "needs-file"
        item.speed = 0
      }
    }
    return saved
  } catch {
    return {}
  }
}

export const useUploads = create<UploadsState>((set, get) => {
  const patch = (key: string, change: Partial<UploadItem>) => {
    const item = get().items[key]
    if (!item) return
    set({ items: { ...get().items, [key]: { ...item, ...change } } })
  }

  const start = (
    key: string,
    file: File,
    onCreated?: (id: string) => void,
    onFailed?: (error: Error) => void
  ) => {
    const upload = new Upload(file, {
      endpoint: UPLOADS_URL,
      retryDelays: [0, 1000, 3000, 5000, 10000],
      chunkSize: 64 * 1024 * 1024,
      metadata: { filename: file.name, filetype: file.type || "application/octet-stream" },
      storeFingerprintForResuming: true,
      removeFingerprintOnSuccess: true,
      onUploadUrlAvailable: () => {
        const id = upload.url?.split("/").pop() ?? null
        if (id) {
          patch(key, { uploadId: id })
          onCreated?.(id)
        }
      },
      onProgress: (sent) => {
        const state = live.get(key)
        const now = performance.now()
        let speed = get().items[key]?.speed ?? 0
        if (state && now - state.lastTime > 500) {
          const instant = ((sent - state.lastBytes) / (now - state.lastTime)) * 1000
          speed = speed ? speed * 0.7 + instant * 0.3 : instant
          state.lastBytes = sent
          state.lastTime = now
        }
        // A progress event can arrive just after pause(): keep it paused.
        const paused = get().items[key]?.status === "paused"
        patch(key, { sent, speed, status: paused ? "paused" : "uploading", error: null })
      },
      onError: (error) => {
        onFailed?.(error)
        patch(key, {
          status: "failed",
          speed: 0,
          error: navigator.onLine
            ? error.message.split("\n")[0]
            : "Connection lost. Retry resumes from here.",
        })
      },
      onSuccess: () => {
        patch(key, { status: "verified", sent: file.size, speed: 0 })
        live.delete(key)
      },
    })
    live.set(key, { upload, file, lastBytes: 0, lastTime: performance.now() })
    upload.findPreviousUploads().then((previous) => {
      if (previous.length) upload.resumeFromPreviousUpload(previous[0])
      upload.start()
    })
  }

  return {
    items: loadSaved(),
    add: (file, draftId) => {
      const key = `${file.name}:${file.size}:${file.lastModified}`
      const existing = get().items[key]
      const running = live.get(key)
      if (running && existing?.uploadId) {
        // Already uploading this file: don't start a second tus upload.
        return Promise.resolve({
          key,
          ref: { source: "upload", location: existing.uploadId, name: file.name, size: file.size },
        })
      }
      set({
        items: {
          ...get().items,
          [key]: {
            uploadId: existing?.uploadId ?? null,
            key,
            name: file.name,
            size: file.size,
            sent: existing?.sent ?? 0,
            speed: 0,
            status: "uploading",
            error: null,
            draftId,
          },
        },
      })
      return new Promise((resolve, reject) => {
        let settled = false
        const created = (id: string) => {
          settled = true
          resolve({ key, ref: { source: "upload", location: id, name: file.name, size: file.size } })
        }
        if (existing?.uploadId) created(existing.uploadId)
        // Rejects only if the upload fails before the server created it; the
        // item stays in the store as "failed" so Retry can start it again.
        const failed = (error: Error) => {
          if (!settled) reject(error)
        }
        start(key, file, existing?.uploadId ? undefined : created, failed)
      })
    },
    pause: (key) => {
      void live.get(key)?.upload.abort()
      patch(key, { status: "paused", speed: 0 })
    },
    resume: (key, file) => {
      const state = live.get(key)
      if (state) {
        state.lastTime = performance.now()
        state.upload.start()
        patch(key, { status: "uploading", error: null })
      } else if (file) {
        start(key, file)
        patch(key, { status: "uploading", error: null })
      } else {
        // No live upload and no file (e.g. after a reload): ask for the file.
        patch(key, { status: "needs-file", speed: 0 })
      }
    },
    remove: (key) => {
      const item = get().items[key]
      const state = live.get(key)
      if (state) void state.upload.abort(true)
      else if (item?.uploadId) void deleteUpload(item.uploadId).catch(() => {})
      live.delete(key)
      const items = { ...get().items }
      delete items[key]
      set({ items })
    },
  }
})

useUploads.subscribe((state) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.items))
  } catch {
    /* storage full or blocked: uploads still work, resume does not */
  }
})

/** Upload item for a FileRef with source "upload". */
export function useUploadFor(ref: FileRef | null | undefined): UploadItem | undefined {
  return useUploads((s) =>
    ref?.source === "upload"
      ? Object.values(s.items).find((i) => i.uploadId === ref.location)
      : undefined
  )
}

/** Totals for the summary, the uploads panel header and the Build gate. */
export function uploadTotals(items: UploadItem[]) {
  const size = items.reduce((a, i) => a + i.size, 0)
  const sent = items.reduce((a, i) => a + i.sent, 0)
  const speed = items.reduce((a, i) => a + (i.status === "uploading" ? i.speed : 0), 0)
  const count = (status: UploadStatus) => items.filter((i) => i.status === status).length
  return {
    size,
    sent,
    files: items.length,
    done: count("verified"),
    uploading: count("uploading"),
    paused: count("paused") + count("needs-file"),
    failed: count("failed"),
    pending: items.some((i) => i.status !== "verified"),
    secondsLeft: speed > 0 ? (size - sent) / speed : Infinity,
  }
}

export function useDraftUploads(draftId: string | undefined): UploadItem[] {
  const items = useUploads((s) => s.items)
  return Object.values(items).filter((i) => i.draftId === draftId)
}

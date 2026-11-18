/**
 * Session and local storage for the assistant stores. Access can throw (private mode,
 * blocked site data, quota), so every call is guarded and the stores work
 * in memory without it.
 */
import { createJSONStorage, type StateStorage } from "zustand/middleware"

/** A Web Storage area whose every access is guarded. */
function guarded(area: () => Storage): StateStorage {
  return {
    getItem: (key) => {
      try {
        return area().getItem(key)
      } catch {
        return null
      }
    },
    setItem: (key, value) => {
      try {
        area().setItem(key, value)
      } catch {
        /* full or blocked: keep the state in memory */
      }
    },
    removeItem: (key) => {
      try {
        area().removeItem(key)
      } catch {
        /* blocked */
      }
    },
  }
}

const safeSession = guarded(() => window.sessionStorage)
const safeLocal = guarded(() => window.localStorage)

export const sessionJsonStorage = <T>() =>
  createJSONStorage<T>(() => safeSession)

/** For per-viewer preferences that should outlast the tab. */
export const localJsonStorage = <T>() => createJSONStorage<T>(() => safeLocal)

export const readSession = (key: string) =>
  safeSession.getItem(key) as string | null
export const writeSession = (key: string, value: string) =>
  void safeSession.setItem(key, value)

import { useSyncExternalStore } from "react"

/** Layout breakpoints (HANDOFF-mobile 1.1). Match Tailwind's sm and lg. */
const PHONE = "(max-width: 639.98px)"
const TOUCH_LAYOUT = "(max-width: 1023.98px)"

function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query)
      list.addEventListener("change", onChange)
      return () => list.removeEventListener("change", onChange)
    },
    () => window.matchMedia(query).matches,
    () => false
  )
}

/** Below 640px: single column, bottom sheets, full-screen panels. */
export function useIsPhone(): boolean {
  return useMediaQuery(PHONE)
}

/**
 * Below 1024px (phone or tablet): the touch layouts. This is about layout
 * only; touch density comes from CSS (pointer: coarse, or this same width).
 */
export function useIsTouchLayout(): boolean {
  return useMediaQuery(TOUCH_LAYOUT)
}

export { useMediaQuery }

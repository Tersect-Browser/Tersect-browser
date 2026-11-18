import { EyeIcon, FlaskConicalIcon, MapPinIcon, Share2Icon } from "lucide-react"
import { useEffect } from "react"
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"
import { useUiStore } from "@/store/ui-store"
import type { ToolbarSheet } from "@/store/ui-store"

const TABS: { sheet: ToolbarSheet; label: string; icon: ReactNode }[] = [
  { sheet: "show", label: "Show", icon: <EyeIcon /> },
  { sheet: "where", label: "Where", icon: <MapPinIcon /> },
  { sheet: "analysis", label: "Analysis", icon: <FlaskConicalIcon /> },
  { sheet: "output", label: "Output", icon: <Share2Icon /> },
]

/**
 * Bottom tab bar of the touch layouts (below 1024px). Each tab opens one
 * toolbar group as a sheet directly above the bar; tapping the open tab again
 * closes it. Hidden while accession selection is open.
 */
export function ToolbarTabBar() {
  const sheet = useUiStore((state) => state.toolbarSheet)
  const setSheet = useUiStore((state) => state.setToolbarSheet)
  const accessionSheetOpen = useUiStore((state) => state.accessionSheetOpen)

  useEffect(() => {
    if (sheet === "none") {
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      // Popovers and menus opened from the sheet handle Escape themselves.
      if (event.key === "Escape" && !event.defaultPrevented) {
        setSheet("none")
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [sheet, setSheet])

  if (accessionSheetOpen) {
    return null
  }
  return (
    <nav
      aria-label="Toolbar"
      className="relative z-[41] box-content grid h-(--tabbar) shrink-0 grid-cols-4 border-t bg-card pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      {TABS.map((tab) => {
        const active = tab.sheet === sheet
        return (
          <button
            key={tab.sheet}
            type="button"
            aria-expanded={active}
            aria-controls="toolbar-sheet"
            className={cn(
              "flex min-w-0 flex-col items-center justify-center gap-[3px] text-t11 font-medium whitespace-nowrap outline-none focus-visible:bg-accent [&_svg]:size-5",
              // Phone landscape: icons only (the bar is 48px there).
              "[@media(max-height:559.98px)]:[&_span]:sr-only",
              active ? "text-primary" : "text-foreground"
            )}
            onClick={() => setSheet(active ? "none" : tab.sheet)}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        )
      })}
    </nav>
  )
}

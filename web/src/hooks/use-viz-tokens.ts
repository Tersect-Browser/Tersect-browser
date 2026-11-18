import { useEffect, useState } from "react"

import { readPlotTheme, type PlotTheme } from "@/plot/theme"

/**
 * The data-visualisation tokens as values canvas code can use. A new object
 * is returned whenever the theme changes (and once web fonts have loaded), so
 * depending on it is enough to make a canvas redraw.
 */
export function useVizTokens(): PlotTheme {
  const [tokens, setTokens] = useState(readPlotTheme)

  useEffect(() => {
    const refresh = () => setTokens(readPlotTheme())
    const observer = new MutationObserver(refresh)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    })
    // Text drawn before the fonts arrive would use a fallback face.
    void document.fonts.ready.then(refresh)
    return () => observer.disconnect()
  }, [])

  return tokens
}

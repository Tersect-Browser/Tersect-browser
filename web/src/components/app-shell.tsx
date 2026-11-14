import { useQuery } from "@tanstack/react-query"
import { MoonIcon, SunIcon } from "lucide-react"
import { Link, NavLink, Outlet } from "react-router"

import { LogoMark } from "@/components/icons"
import { useTheme } from "@/components/theme-provider"
import { Button } from "@/components/ui/button"
import { getDatasets } from "@/lib/api"
import { BASE_URL } from "@/lib/config"
import { cn } from "@/lib/utils"
import { usePlotStore } from "@/store/plot-store"

const RESEARCH_GROUP_URL =
  "https://www.cranfield.ac.uk/centres/soil-and-agrifood-institute/research-groups/bioinformatics-group"

/** Shared with the home page, which lists the same datasets. */
export function useDatasets() {
  return useQuery({
    queryKey: ["datasets"],
    queryFn: ({ signal }) => getDatasets(signal),
    staleTime: 5 * 60_000,
  })
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const isDark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches)
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </Button>
  )
}

/** Name and reference assembly of the dataset open in the browser. */
function CurrentDataset() {
  const datasetId = usePlotStore((state) => state.datasetId)
  const datasets = useDatasets()
  if (!datasetId) {
    return null
  }
  const assembly = datasets.data?.find(
    (dataset) => dataset.dataset_id === datasetId
  )?.reference
  return (
    <div className="flex min-w-0 items-center gap-2 border-l pl-3">
      <span className="truncate">{datasetId}</span>
      {assembly && (
        <span className="rounded-sm border px-1.5 py-px font-mono text-[10px] text-muted-foreground">
          {assembly}
        </span>
      )}
    </div>
  )
}

function NavItem({ to, children }: { to: string; children: string }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        cn(
          "rounded-lg px-2 py-1 hover:bg-accent",
          isActive ? "text-foreground" : "text-muted-foreground"
        )
      }
    >
      {children}
    </NavLink>
  )
}

/** Top bar shared by every page. */
export function AppShell() {
  return (
    <div className="flex h-full flex-col">
      <header className="z-20 flex h-10 shrink-0 items-center gap-3 border-b bg-card px-3">
        <Link to="/" className="flex shrink-0 items-center gap-2">
          <LogoMark className="size-[18px]" />
          <span className="text-[13px] font-semibold">Tersect Browser</span>
        </Link>
        <CurrentDataset />
        <nav className="ml-auto flex shrink-0 items-center gap-1 font-medium">
          <NavItem to="/">Home</NavItem>
          <NavItem to="/about">About</NavItem>
          <ThemeToggle />
          <a
            href={RESEARCH_GROUP_URL}
            target="_blank"
            rel="noreferrer"
            className="ml-1 flex items-center"
          >
            {/* The supplied logo is white on transparent. */}
            <img
              src={`${BASE_URL}cranfield_logo.png`}
              alt="Cranfield University bioinformatics group"
              className="size-6 invert dark:invert-0"
            />
          </a>
        </nav>
      </header>
      <main className="min-h-0 flex-1">
        <Outlet />
      </main>
    </div>
  )
}

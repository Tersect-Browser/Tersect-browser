import { useQuery, useQueryClient } from "@tanstack/react-query"
import { MenuIcon, MoonIcon, SunIcon } from "lucide-react"
import { Link, NavLink, Outlet, useNavigate } from "react-router"

import { LogoMark } from "@/components/icons"
import { useTheme } from "@/components/theme-provider"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { logout, sessionQuery, useSession } from "@/features/auth/session"
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
    <div className="flex min-w-0 items-center gap-2 border-l pl-3 max-sm:hidden">
      <span className="truncate">{datasetId}</span>
      {assembly && (
        <span className="rounded-sm border px-1.5 py-px font-mono text-t10 text-muted-foreground">
          {assembly}
        </span>
      )}
    </div>
  )
}

function NavItem({
  to,
  end = true,
  children,
}: {
  to: string
  /** Active only on this exact path (false: also on its sub-paths). */
  end?: boolean
  children: string
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          "rounded-lg px-2 py-1 whitespace-nowrap hover:bg-accent",
          isActive ? "text-foreground" : "text-muted-foreground"
        )
      }
    >
      {children}
    </NavLink>
  )
}

function useSignOut() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  return async () => {
    await logout()
    await queryClient.invalidateQueries({ queryKey: sessionQuery.queryKey })
    // Everything fetched from the builder was for the signed-in user.
    queryClient.removeQueries({
      predicate: ({ queryKey }) =>
        queryKey[0] === "builder" &&
        queryKey[1] !== "session" &&
        queryKey[1] !== "config",
    })
    navigate("/")
  }
}

function SignOut() {
  const signOut = useSignOut()
  return (
    <button
      type="button"
      className="rounded-lg px-2 py-1 whitespace-nowrap text-muted-foreground hover:bg-accent"
      onClick={signOut}
    >
      Sign out
    </button>
  )
}

/** The page links as a menu: phones have no room for them in the bar. */
function PhoneNav({
  canManage,
  signedOut,
  authenticated,
}: {
  canManage: boolean
  signedOut: boolean
  authenticated: boolean
}) {
  const signOut = useSignOut()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Menu">
          <MenuIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuItem asChild>
          <Link to="/">Home</Link>
        </DropdownMenuItem>
        {canManage && (
          <DropdownMenuItem asChild>
            <Link to="/builds">Builds</Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <Link to="/about">About</Link>
        </DropdownMenuItem>
        {signedOut && (
          <DropdownMenuItem asChild>
            <Link to="/login">Sign in</Link>
          </DropdownMenuItem>
        )}
        {authenticated && (
          <DropdownMenuItem onSelect={signOut}>Sign out</DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <a href={RESEARCH_GROUP_URL} target="_blank" rel="noreferrer">
            Cranfield bioinformatics group
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Top bar shared by every page. */
export function AppShell() {
  const { session, canManage, signedOut } = useSession()
  return (
    <div className="flex h-full flex-col">
      <header className="z-20 box-content flex h-(--topbar) shrink-0 items-center gap-3 border-b bg-card px-3 pt-[env(safe-area-inset-top)]">
        <Link to="/" className="flex shrink-0 items-center gap-2">
          <LogoMark className="size-[18px]" />
          <span className="text-t13 font-semibold whitespace-nowrap">
            Tersect Browser
          </span>
        </Link>
        <CurrentDataset />
        <nav className="ml-auto flex shrink-0 items-center gap-1 font-medium">
          <div className="flex items-center gap-1 max-sm:hidden">
            <NavItem to="/">Home</NavItem>
            {canManage && (
              <NavItem to="/builds" end={false}>
                Builds
              </NavItem>
            )}
            <NavItem to="/about">About</NavItem>
            {signedOut && <NavItem to="/login">Sign in</NavItem>}
            {session.authenticated && <SignOut />}
          </div>
          <ThemeToggle />
          <div className="sm:hidden">
            <PhoneNav
              canManage={canManage}
              signedOut={signedOut}
              authenticated={session.authenticated}
            />
          </div>
          <a
            href={RESEARCH_GROUP_URL}
            target="_blank"
            rel="noreferrer"
            className="ml-1 flex items-center max-sm:hidden"
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

import { Navigate, Outlet, useLocation } from "react-router"

import { Spinner } from "@/components/ui/spinner"

import { useSession } from "./session"

/** Routes that manage datasets: sends visitors without a session to sign in. */
export function RequireLogin() {
  const { isPending, signedOut } = useSession()
  const location = useLocation()
  if (isPending) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Spinner />
      </div>
    )
  }
  if (signedOut) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname + location.search }}
      />
    )
  }
  return <Outlet />
}

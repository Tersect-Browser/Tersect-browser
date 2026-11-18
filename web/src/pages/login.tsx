import { useQueryClient } from "@tanstack/react-query"
import { useState, type FormEvent } from "react"
import { Navigate, useLocation, useNavigate } from "react-router"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { login, sessionQuery, useSession } from "@/features/auth/session"

/** Sign-in for the people who add and manage datasets. */
export function LoginPage() {
  const { session, isPending, signedOut } = useSession()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? "/"

  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (isPending) {
    return null
  }
  // Nothing to sign in to, or already signed in.
  if (!signedOut) {
    return <Navigate to={session.authenticated ? from : "/"} replace />
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      queryClient.setQueryData(
        sessionQuery.queryKey,
        await login(username, password)
      )
      // Lists fetched while signed out are not the managed ones.
      await queryClient.invalidateQueries({ queryKey: ["builder"] })
      navigate(from, { replace: true })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Signing in failed.")
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full items-start justify-center overflow-auto px-6 pt-24">
      <form
        onSubmit={submit}
        className="flex w-full max-w-[320px] flex-col gap-4 rounded-xl border bg-card p-5"
      >
        <div className="flex flex-col gap-1">
          <h1 className="text-sm font-semibold">Sign in</h1>
          <p className="text-muted-foreground">
            For adding and managing datasets. Browsing them needs no account.
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="login-username">User name</Label>
          <Input
            id="login-username"
            autoComplete="username"
            autoFocus
            required
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="login-password">Password</Label>
          <Input
            id="login-password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" size="sm" disabled={busy}>
          {busy && <Spinner />} Sign in
        </Button>
      </form>
    </div>
  )
}

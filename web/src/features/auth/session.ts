/**
 * The builder's login (pipeline/tbpipeline/server/auth.py). Viewing datasets
 * never needs it; adding, changing and deleting them does when the server
 * has a login configured.
 */
import { queryOptions, useQuery } from "@tanstack/react-query"

import { BUILDER_API_URL } from "@/lib/config"

export interface Session {
  /** The server has a login: managing datasets needs it. */
  required: boolean
  authenticated: boolean
  username: string | null
}

/** No builder, or one without a login: nothing to sign in to. */
const OPEN: Session = { required: false, authenticated: false, username: null }

async function getSession(): Promise<Session> {
  try {
    const response = await fetch(`${BUILDER_API_URL}/session`)
    return response.ok ? ((await response.json()) as Session) : OPEN
  } catch {
    return OPEN
  }
}

export const sessionQuery = queryOptions({
  queryKey: ["builder", "session"],
  queryFn: getSession,
  // Sessions expire on the server; look again when the user comes back.
  staleTime: 30_000,
  refetchOnWindowFocus: true,
  retry: false,
})

export function useSession() {
  const query = useQuery(sessionQuery)
  const session = query.data ?? OPEN
  return {
    session,
    isPending: query.isPending,
    /** May add, change and delete datasets (always true without a login). */
    canManage: query.isSuccess && (!session.required || session.authenticated),
    /** Should be offered the sign-in. */
    signedOut: query.isSuccess && session.required && !session.authenticated,
  }
}

export async function login(
  username: string,
  password: string
): Promise<Session> {
  const response = await fetch(`${BUILDER_API_URL}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  })
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(
      typeof body?.detail === "string" ? body.detail : "Signing in failed."
    )
  }
  return body as Session
}

export async function logout(): Promise<void> {
  await fetch(`${BUILDER_API_URL}/logout`, { method: "POST" })
}

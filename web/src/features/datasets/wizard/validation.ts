import { queryOptions, useQuery } from "@tanstack/react-query"
import { useMemo } from "react"

import { validateManifest } from "../api"
import { toManifest } from "../manifest"
import type { ManifestInput, WizardForm } from "../types"

/** Server validation of a manifest; cached per manifest. */
export const validationQuery = (manifest: ManifestInput) =>
  queryOptions({
    queryKey: ["builder", "validate", manifest],
    queryFn: ({ signal }) => validateManifest(manifest, signal),
    staleTime: Infinity,
    gcTime: 60_000,
    retry: false,
  })

/** Validation of the form as it is now; runs only while `enabled` (Review). */
export function useValidation(form: WizardForm, enabled: boolean) {
  const manifest = useMemo(() => toManifest(form), [form])
  const query = useQuery({ ...validationQuery(manifest), enabled })
  return { manifest, ...query }
}

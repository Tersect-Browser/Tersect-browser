import { useEffect, useRef } from "react"
import { useNavigate } from "react-router"

import { Spinner } from "@/components/ui/spinner"

import { newDraft } from "../wizard-store"

/** /datasets/new: create an empty draft and open it in the wizard. */
export function NewDatasetPage() {
  const navigate = useNavigate()
  const started = useRef(false)
  const failed = useRef<string | null>(null)

  useEffect(() => {
    if (started.current) return
    started.current = true
    newDraft().then(
      (draft) => navigate(`/datasets/drafts/${draft.id}`, { replace: true }),
      (error: Error) => {
        failed.current = error.message
        navigate("/", { replace: true, state: { error: "The dataset builder is not available." } })
      }
    )
  }, [navigate])

  return (
    <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
      <Spinner /> Starting a new dataset…
    </div>
  )
}

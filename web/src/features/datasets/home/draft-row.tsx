import { useMutation, useQueryClient } from "@tanstack/react-query"
import { EllipsisIcon, PencilLineIcon, Trash2Icon } from "lucide-react"
import { Link } from "react-router"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

import { deleteDraft } from "../api"
import { DraftBadge } from "../build/status-badge"
import { formatCount, formatWhen } from "../format"
import { WIZARD_STEPS, type Draft } from "../types"
import { ROW } from "./layout"

/** "Draft. Step 2 of 4, 12 accessions. Last edited today 14:02." */
function describe(draft: Draft): string {
  const step = WIZARD_STEPS.indexOf(draft.step) + 1
  const count = draft.form.accessions.length
  const when = formatWhen(draft.updated_at).replace(/^Today/, "today")
  return `Draft. Step ${step} of 4, ${formatCount(count)} ${
    count === 1 ? "accession" : "accessions"
  }. Last edited ${when}.`
}

/** A wizard draft no build has started from; Resume opens its last step. */
export function DraftRow({ draft }: { draft: Draft }) {
  const queryClient = useQueryClient()
  const to = `/datasets/drafts/${encodeURIComponent(draft.id)}`
  const name = draft.form.name || draft.base_dataset || "Untitled dataset"
  const accessions = (draft.base_accessions ?? 0) + draft.form.accessions.length

  const discard = useMutation({
    mutationFn: () => deleteDraft(draft.id),
    onSuccess: () => toast.success("Draft deleted"),
    onError: (e: Error) => toast.error(`Could not delete the draft: ${e.message}`),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["builder", "drafts"] }),
  })

  return (
    <div className={`${ROW} relative hover:bg-accent`}>
      <span className="min-w-0">
        <Link
          to={to}
          className="block truncate text-sm font-semibold outline-none after:absolute after:inset-0 focus-visible:underline"
        >
          {name}
        </Link>
        <span className="block truncate text-muted-foreground">{describe(draft)}</span>
      </span>
      <span className="truncate font-mono">{draft.form.reference.id || "—"}</span>
      <span className="text-right font-mono">{formatCount(accessions)}</span>
      <span className="flex flex-col items-start gap-0.5">
        <DraftBadge />
        <Link
          to={to}
          className="relative z-10 pl-1 text-[11px] text-primary hover:underline"
        >
          Resume
        </Link>
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            className="relative z-10"
            aria-label={`Actions for draft ${name}`}
          >
            <EllipsisIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem asChild>
            <Link to={to}>
              <PencilLineIcon /> Resume
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            disabled={discard.isPending}
            onSelect={() => discard.mutate()}
          >
            <Trash2Icon /> Delete draft
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

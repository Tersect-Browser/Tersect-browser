import {
  CheckIcon,
  CircleCheckIcon,
  CircleXIcon,
  FileTextIcon,
  XIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { formatBytes } from "../format"
import { useWizardStore } from "../wizard-store"
import { setProposalState, type ProposalState } from "./store"
import { PROPOSAL_STEP, STEP_NUMBER, applyProposal } from "./suggestions"
import type { LinkCheck, Proposal } from "./types"

/** Proposals for locked steps cannot be applied in add mode. */
const LOCKED_IN_ADD = new Set<Proposal["kind"]>(["reference", "options"])

function LinkLine({ link }: { link: LinkCheck }) {
  return (
    <li className="flex min-w-0 items-center gap-1.5 text-t11">
      {link.ok ? (
        <CircleCheckIcon
          aria-label="Reachable"
          className="size-3 shrink-0 text-primary"
        />
      ) : (
        <CircleXIcon
          aria-label="Not reachable"
          className="size-3 shrink-0 text-destructive"
        />
      )}
      <span
        className={cn(
          "min-w-0 flex-1 truncate font-mono",
          !link.ok && "text-muted-foreground line-through"
        )}
        title={link.url}
      >
        {link.url.replace(/^(https?|ftp):\/\//, "")}
      </span>
      <span
        className={cn(
          "max-w-[55%] shrink-0 truncate font-mono",
          link.ok ? "text-muted-foreground" : "text-destructive"
        )}
      >
        {link.ok
          ? link.size != null
            ? `reachable · ${formatBytes(link.size)}`
            : "reachable"
          : (link.error ?? "not found")}
      </span>
    </li>
  )
}

function statusText(state: ProposalState, step: number): string {
  switch (state) {
    case "applied":
      return `Shown as suggested in step ${step}`
    case "accepted":
      return `Accepted in step ${step}`
    case "rejected":
      return `Dismissed in step ${step}`
    default:
      return "Dismissed"
  }
}

export function ProposalCard({
  draftId,
  proposal,
  state,
}: {
  draftId: string
  proposal: Proposal
  state: ProposalState
}) {
  const addMode = useWizardStore((s) => s.draft?.mode === "add")
  const step = STEP_NUMBER[PROPOSAL_STEP[proposal.kind]]
  const locked = addMode && LOCKED_IN_ADD.has(proposal.kind)
  const titleId = `proposal-${proposal.id}`

  return (
    <article
      aria-labelledby={titleId}
      className="flex flex-col gap-1.5 rounded-md border bg-card px-2.5 py-2"
    >
      <div className="flex flex-col gap-0.5">
        <h3 id={titleId} className="font-semibold">
          {proposal.title}
        </h3>
        {proposal.note && (
          <p className="text-t11 text-muted-foreground">{proposal.note}</p>
        )}
      </div>
      {proposal.links.length > 0 && (
        <ul className="flex flex-col gap-0.5" aria-label="Checked links">
          {proposal.links.map((link) => (
            <LinkLine key={link.url} link={link} />
          ))}
        </ul>
      )}
      {proposal.more && (
        <p className="pl-[18px] text-t11 text-muted-foreground">
          {proposal.more}
        </p>
      )}
      <p className="flex items-start gap-1.5 text-t11 text-muted-foreground">
        <FileTextIcon className="mt-px size-3 shrink-0" />
        <span className="min-w-0">Source: {proposal.source}</span>
      </p>

      {state === "open" ? (
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          {proposal.applicable && !locked && (
            <Button size="sm" onClick={() => applyProposal(draftId, proposal)}>
              {proposal.action}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setProposalState(draftId, proposal.id, "dismissed")}
          >
            Dismiss
          </Button>
          {!proposal.applicable && (
            <span className="text-t11 text-muted-foreground">
              Nothing in it can be used.
            </span>
          )}
          {proposal.applicable && locked && (
            <span className="text-t11 text-muted-foreground">
              Step {step} is locked when adding accessions.
            </span>
          )}
        </div>
      ) : (
        <p
          role="status"
          className="flex items-center gap-1.5 border-t pt-1.5 text-t11 text-muted-foreground"
        >
          {state === "applied" || state === "accepted" ? (
            <CheckIcon className="size-3 shrink-0 text-primary" />
          ) : (
            <XIcon className="size-3 shrink-0" />
          )}
          {statusText(state, step)}
          {state === "applied" && (
            <Button
              variant="link"
              size="xs"
              className="ml-auto h-auto px-0 text-t11 max-lg:min-h-11 max-lg:px-2 pointer-coarse:min-h-11 pointer-coarse:px-2"
              onClick={() =>
                useWizardStore.getState().setStep(PROPOSAL_STEP[proposal.kind])
              }
            >
              Show
            </Button>
          )}
        </p>
      )}
    </article>
  )
}

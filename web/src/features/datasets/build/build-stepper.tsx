import { BanIcon, CheckIcon, XIcon } from "lucide-react"

import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

import { formatDuration } from "../format"
import { BUILD_STAGES, type BuildStage, type StageKey, type StageStatus } from "../types"

/** What each stage's sub-count counts (the server sends numbers only). */
const UNITS: Record<StageKey, string> = {
  fetch: "files",
  reference: "sequences",
  accessions: "accessions",
  index: "chromosomes",
  annotate: "chromosomes",
  load: "chromosomes",
  publish: "steps",
}

function Marker({ status, number }: { status: StageStatus; number: number }) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative z-10 flex size-[18px] shrink-0 items-center justify-center rounded-full border bg-background font-mono text-[10px] font-medium",
        status === "done" && "border-primary bg-primary text-primary-foreground",
        status === "active" && "border-primary text-primary",
        status === "failed" && "border-destructive bg-destructive text-white",
        status === "cancelled" && "border-muted bg-muted text-muted-foreground",
        status === "todo" && "border-input text-muted-foreground"
      )}
    >
      {status === "done" && <CheckIcon className="size-[11px]" />}
      {status === "active" && <Spinner className="size-[11px]" aria-hidden />}
      {status === "failed" && <XIcon className="size-[11px]" />}
      {status === "cancelled" && <BanIcon className="size-[10px]" />}
      {status === "todo" && number}
    </span>
  )
}

const STATUS_LABEL: Record<StageStatus, string> = {
  done: "done",
  active: "in progress",
  failed: "failed",
  cancelled: "cancelled",
  todo: "to do",
}

/**
 * The seven pipeline stages top to bottom, joined by a 1px line. `tick` is
 * added to the active stage's elapsed time so it counts up between events.
 */
export function BuildStepper({
  stages,
  tick = 0,
}: {
  stages: BuildStage[]
  tick?: number
}) {
  return (
    <ol className="flex flex-col" aria-label="Build stages">
      {BUILD_STAGES.map(({ key, name }, index) => {
        const stage = stages.find((s) => s.key === key)
        const status = stage?.status ?? "todo"
        const last = index === BUILD_STAGES.length - 1
        const hasCount = stage?.total != null && stage.total > 0
        const count = hasCount
          ? `${stage.done ?? 0} / ${stage.total} ${stage.unit ?? UNITS[key]}`
          : null
        const sub = [count, stage?.detail].filter(Boolean).join(" · ")
        const elapsed =
          stage?.elapsed != null
            ? stage.elapsed + (status === "active" ? tick : 0)
            : null
        return (
          <li
            key={key}
            className="relative flex gap-2.5 pb-3 last:pb-0"
            aria-current={status === "active" ? "step" : undefined}
          >
            {!last && (
              <span
                aria-hidden
                className={cn(
                  "absolute top-[18px] bottom-0 left-[8.5px] w-px",
                  status === "done" ? "bg-primary" : "bg-border"
                )}
              />
            )}
            <Marker status={status} number={index + 1} />
            <div className="flex min-w-0 flex-1 flex-col gap-1 pt-px">
              <div className="flex min-w-0 items-baseline gap-2">
                <span
                  className={cn(
                    "shrink-0",
                    (status === "active" || status === "failed") && "font-semibold",
                    status === "failed" && "text-destructive",
                    status === "todo" && "text-muted-foreground"
                  )}
                >
                  {name}
                  <span className="sr-only">, {STATUS_LABEL[status]}</span>
                </span>
                {sub && (
                  <span className="min-w-0 truncate font-mono text-[11px] text-muted-foreground">
                    {sub}
                  </span>
                )}
                {elapsed != null && (
                  <span className="ml-auto shrink-0 font-mono text-[11px] text-muted-foreground">
                    {formatDuration(elapsed)}
                  </span>
                )}
              </div>
              {status === "active" && hasCount && (
                <div
                  role="progressbar"
                  aria-label={`${name} progress`}
                  aria-valuemin={0}
                  aria-valuemax={stage.total ?? 0}
                  aria-valuenow={stage.done ?? 0}
                  className="h-[3px] w-full overflow-hidden rounded-full bg-muted"
                >
                  <div
                    className="h-full rounded-full bg-primary transition-[width]"
                    style={{
                      width: `${Math.min(100, ((stage.done ?? 0) / (stage.total ?? 1)) * 100)}%`,
                    }}
                  />
                </div>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

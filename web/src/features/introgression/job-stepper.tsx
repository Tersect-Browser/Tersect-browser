import { CheckIcon, XIcon } from "lucide-react"
import { Fragment } from "react"

import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

import { JOB_STAGES } from "./types"

/**
 * Four stages joined by lines, with the latest server status beneath.
 * `stage` is the active stage (JOB_STAGES.length when all are done).
 */
export function JobStepper({
  stage,
  failedStage,
  status,
}: {
  stage: number
  failedStage: number | null
  status: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <ol className="flex items-center gap-1.5">
        {JOB_STAGES.map((name, index) => {
          const failed = failedStage === index
          const done = !failed && index < stage
          const active = !failed && failedStage === null && index === stage
          const todo = !done && !active && !failed
          return (
            <Fragment key={name}>
              <li
                className="flex shrink-0 items-center gap-1.5"
                aria-current={active ? "step" : undefined}
              >
                <span
                  className={cn(
                    "flex size-[18px] items-center justify-center rounded-full border font-mono text-[10px] font-medium",
                    done && "border-primary bg-primary text-primary-foreground",
                    active && "border-primary text-primary",
                    failed && "border-destructive bg-destructive text-white",
                    todo && "border-input text-muted-foreground"
                  )}
                >
                  {done && <CheckIcon className="size-[11px]" />}
                  {active && <Spinner className="size-[11px]" />}
                  {failed && <XIcon className="size-[11px]" />}
                  {todo && index + 1}
                </span>
                <span
                  className={cn(
                    "whitespace-nowrap",
                    (active || failed) && "font-semibold",
                    failed && "text-destructive",
                    todo && "text-muted-foreground"
                  )}
                >
                  {name}
                </span>
              </li>
              {index < JOB_STAGES.length - 1 && (
                <span
                  aria-hidden
                  className={cn(
                    "h-px min-w-3 flex-1",
                    done ? "bg-primary" : "bg-border"
                  )}
                />
              )}
            </Fragment>
          )
        })}
      </ol>
      <div className="font-mono text-[11px] text-muted-foreground">
        {status}
      </div>
    </div>
  )
}

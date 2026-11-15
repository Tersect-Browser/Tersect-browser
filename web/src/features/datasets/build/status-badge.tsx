import {
  BanIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  ClockIcon,
  PencilLineIcon,
} from "lucide-react"
import type { ReactNode } from "react"

import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

import type { Build, DatasetStatus } from "../types"

export type BadgeTone = "ready" | "busy" | "failed" | "muted"

const TONES: Record<BadgeTone, string> = {
  ready: "bg-accent text-accent-foreground",
  busy: "bg-secondary text-secondary-foreground",
  failed:
    "bg-[color-mix(in_oklch,var(--destructive)_14%,transparent)] text-destructive",
  muted: "bg-muted text-muted-foreground",
}

/** 20px status pill: icon and a short label. */
export function StatusBadge({
  tone,
  icon,
  children,
  className,
}: {
  tone: BadgeTone
  icon: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-2 text-[11px] font-medium whitespace-nowrap [&_svg]:size-3 [&_svg]:shrink-0",
        TONES[tone],
        className
      )}
    >
      {icon}
      {children}
    </span>
  )
}

/** Status of a published dataset on Home (Draft rows use DraftBadge). */
export function DatasetStatusBadge({
  status,
  progress,
}: {
  status: DatasetStatus
  progress?: number | null
}) {
  if (status === "ready") {
    return (
      <StatusBadge tone="ready" icon={<CircleCheckIcon />}>
        Ready
      </StatusBadge>
    )
  }
  if (status === "building") {
    return (
      <StatusBadge tone="busy" icon={<Spinner aria-hidden />}>
        Building
        {progress != null && (
          <span className="font-mono">{Math.round(progress)}%</span>
        )}
      </StatusBadge>
    )
  }
  return (
    <StatusBadge tone="failed" icon={<CircleAlertIcon />}>
      Failed
    </StatusBadge>
  )
}

export function DraftBadge() {
  return (
    <StatusBadge tone="muted" icon={<PencilLineIcon />}>
      Draft
    </StatusBadge>
  )
}

/** Status of one build (build view and Builds page). */
export function BuildStatusBadge({ build }: { build: Pick<Build, "status" | "rebuild"> }) {
  switch (build.status) {
    case "queued":
      return (
        <StatusBadge tone="muted" icon={<ClockIcon />}>
          Queued
        </StatusBadge>
      )
    case "running":
      return (
        <StatusBadge tone="busy" icon={<Spinner aria-hidden />}>
          {build.rebuild ? "Rebuilding" : "Building"}
        </StatusBadge>
      )
    case "failed":
      return (
        <StatusBadge tone="failed" icon={<CircleAlertIcon />}>
          Failed
        </StatusBadge>
      )
    case "cancelled":
      return (
        <StatusBadge tone="muted" icon={<BanIcon />}>
          Cancelled
        </StatusBadge>
      )
    case "succeeded":
      return (
        <StatusBadge tone="ready" icon={<CircleCheckIcon />}>
          Ready
        </StatusBadge>
      )
  }
}

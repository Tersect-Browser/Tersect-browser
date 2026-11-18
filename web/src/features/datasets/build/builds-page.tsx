import { useQuery } from "@tanstack/react-query"
import { ChevronRightIcon } from "lucide-react"
import { Link } from "react-router"

import { Skeleton } from "@/components/ui/skeleton"

import { buildsQuery } from "../api"
import { formatCount, formatDuration, formatWhen } from "../format"
import type { Build } from "../types"
import { BuildStatusBadge } from "./status-badge"
import { currentStage, stageName } from "./use-build"

/**
 * Desktop: six columns. Tablet: five, without Started by. Phone: a card per
 * build, with the name and View, then the status, then started and duration.
 * The View column follows the text size, which grows on touch.
 */
const GRID =
  "grid items-center px-3 max-sm:grid-cols-[minmax(0,1fr)_auto] max-sm:gap-x-3 max-sm:gap-y-1 max-sm:[grid-template-areas:'nm_vw'_'st_st'_'sd_du'] sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1.7fr)_6.5rem_5.25rem_max(2.5rem,calc(var(--t11)*3.6))] sm:gap-3 lg:grid-cols-[minmax(8rem,1fr)_minmax(12rem,1.6fr)_6.5rem_5.5rem_7rem_max(2.5rem,calc(var(--t11)*3.6))]"

/** A build or placeholder row: 30px in the table (44px on touch), a padded card on phones. */
const ROW = `${GRID} border-b last:border-b-0 max-sm:py-2.5 sm:min-h-(--c30)`

/** The muted line beside the badge: where the build is, or what it made. */
function statusDetail(build: Build): string {
  switch (build.status) {
    case "queued":
      return [
        build.queue_position != null ? `Position ${build.queue_position}` : "Waiting",
        build.description,
      ]
        .filter(Boolean)
        .join(" · ")
    case "running": {
      const stage = build.stages.find((s) => s.status === "active")
      const count = stage?.total ? ` ${stage.done ?? 0} / ${stage.total}` : ""
      return stage ? `${stageName(stage.key)}${count}` : (build.description ?? "")
    }
    case "failed":
    case "cancelled":
      return `At ${stageName(currentStage(build)?.key)}`
    case "succeeded":
      return build.summary
        ? `${formatCount(build.summary.accessions)} accessions`
        : (build.description ?? "")
  }
}

function Message({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="px-4 py-8 text-center">
      <div className="text-sm font-semibold">{title}</div>
      <p className="mt-1 text-muted-foreground">{detail}</p>
    </div>
  )
}

/** /builds: every build, newest first, with the queue. */
export function BuildsPage() {
  const builds = useQuery(buildsQuery)
  const rows = builds.data ?? []

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto flex max-w-[1000px] flex-col gap-4 px-4 pt-6 pb-[calc(2.5rem+env(safe-area-inset-bottom))] sm:px-6 sm:pt-10">
        <div className="flex flex-col gap-1">
          <h1 className="text-[18px] leading-tight font-semibold">Builds</h1>
          <p className="text-muted-foreground">
            One build runs at a time. Others wait in the queue.
          </p>
        </div>

        <section className="overflow-x-auto rounded-xl border bg-card">
          <div className="lg:min-w-[720px]">
            <div className={`${GRID} caption min-h-7 border-b max-sm:hidden`}>
              <span>Dataset</span>
              <span>Status</span>
              <span>Started</span>
              <span className="text-right">Duration</span>
              <span className="max-lg:hidden">Started by</span>
              <span className="sr-only">View</span>
            </div>

            {builds.isPending &&
              [0, 1, 2].map((row) => (
                <div key={row} className={ROW}>
                  <Skeleton className="h-3.5 w-28 max-sm:[grid-area:nm]" />
                  <Skeleton className="h-3.5 w-40 max-sm:[grid-area:st]" />
                  <Skeleton className="h-3.5 w-16 max-sm:[grid-area:sd]" />
                  <Skeleton className="ml-auto h-3.5 w-12 max-sm:[grid-area:du]" />
                  <Skeleton className="h-3.5 w-14 max-lg:hidden" />
                  <span className="max-sm:hidden" />
                </div>
              ))}

            {builds.isError && (
              <Message
                title="Builds could not be loaded"
                detail="The dataset builder did not respond. Check that it is running."
              />
            )}
            {builds.isSuccess && rows.length === 0 && (
              <Message
                title="No builds yet"
                detail="A build starts when a dataset is created from the New dataset wizard."
              />
            )}

            {rows.map((build) => (
              <Link
                key={build.id}
                to={`/builds/${encodeURIComponent(build.id)}`}
                className={`${ROW} hover:bg-accent focus-visible:bg-accent focus-visible:outline-none`}
              >
                <span className="min-w-0 truncate font-medium max-sm:[grid-area:nm]">
                  {build.dataset_id}
                </span>
                <span className="flex min-w-0 items-center gap-2 max-sm:[grid-area:st]">
                  <BuildStatusBadge build={build} />
                  <span className="min-w-0 truncate text-t11 text-muted-foreground">
                    {statusDetail(build)}
                  </span>
                </span>
                <span className="text-t11 whitespace-nowrap text-muted-foreground max-sm:[grid-area:sd]">
                  {formatWhen(build.started_at ?? build.created_at)}
                </span>
                <span className="text-right font-mono text-t11 whitespace-nowrap max-sm:[grid-area:du]">
                  {build.started_at ? formatDuration(build.elapsed) : "—"}
                </span>
                <span className="min-w-0 truncate font-mono text-t11 text-muted-foreground max-lg:hidden">
                  {build.started_by ?? "—"}
                </span>
                <span className="flex items-center justify-end text-t11 whitespace-nowrap text-primary max-sm:[grid-area:vw]">
                  View
                  <ChevronRightIcon className="size-3" aria-hidden />
                </span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

import { useQuery } from "@tanstack/react-query"
import {
  ArrowRightIcon,
  DatabaseIcon,
  HistoryIcon,
  PlusIcon,
} from "lucide-react"
import { useEffect, useRef } from "react"
import { Link, useLocation, useNavigate } from "react-router"
import { toast } from "sonner"

import { useDatasets } from "@/components/app-shell"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { useSession } from "@/features/auth/session"
import { datasetsQuery, draftsQuery } from "@/features/datasets/api"
import { DatasetRow } from "@/features/datasets/home/dataset-row"
import { DraftRow } from "@/features/datasets/home/draft-row"
import {
  DESCRIPTION,
  GRID,
  PHONE_META,
  ROW,
  WIDE_CELL,
  phoneMeta,
} from "@/features/datasets/home/layout"
import type { DatasetPublic } from "@/lib/types"

const BUILDER_DOWN = "The dataset builder is not running on this server."

function Message({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="px-4 py-8 text-center">
      <div className="text-sm font-semibold">{title}</div>
      <p className="mt-1 text-muted-foreground">{detail}</p>
    </div>
  )
}

function LoadingRows() {
  return [0, 1, 2].map((row) => (
    <div key={row} className={ROW}>
      <Skeleton className="h-4 w-48" />
      <Skeleton className={`h-4 w-16 ${WIDE_CELL}`} />
      <Skeleton className={`ml-auto h-4 w-10 ${WIDE_CELL}`} />
      <Skeleton className={`h-4 w-14 ${WIDE_CELL}`} />
      <span />
    </div>
  ))
}

function NewDatasetButton({ disabled }: { disabled?: boolean }) {
  if (disabled) {
    return (
      <Button size="sm" disabled title={BUILDER_DOWN}>
        <PlusIcon /> New dataset
      </Button>
    )
  }
  return (
    <Button size="sm" asChild>
      <Link to="/datasets/new">
        <PlusIcon /> New dataset
      </Link>
    </Button>
  )
}

function EmptyDatasets() {
  return (
    <Empty className="rounded-xl border border-dashed">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <DatabaseIcon />
        </EmptyMedia>
        <EmptyTitle>No datasets yet</EmptyTitle>
        <EmptyDescription className="text-xs">
          A dataset is a reference genome and the accessions called against it,
          from their VCF files.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <NewDatasetButton />
      </EmptyContent>
    </Empty>
  )
}

/** Without the builder: the datasets the browser serves, as plain rows. */
function PublishedList() {
  const datasets = useDatasets()
  const rows = (datasets.data ?? []) as DatasetPublic[]
  return (
    <>
      {datasets.isPending && <LoadingRows />}
      {datasets.isError && (
        <Message
          title="Datasets could not be loaded"
          detail="The server did not respond. Check that the backend is running."
        />
      )}
      {datasets.isSuccess && rows.length === 0 && (
        <Message
          title="No datasets yet"
          detail="Datasets appear here once they have been added to the server."
        />
      )}
      {rows.map((dataset) => (
        <Link
          key={dataset.dataset_id}
          to={`/share/${dataset.view_id}`}
          className={`${ROW} hover:bg-accent`}
        >
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">
              {dataset.dataset_id}
            </span>
            {dataset.description && (
              <span className={DESCRIPTION}>{dataset.description}</span>
            )}
            <span className={PHONE_META}>
              {phoneMeta(
                dataset.reference,
                dataset.accession_count?.toLocaleString("en-US")
              )}
            </span>
          </span>
          <span className={`truncate font-mono ${WIDE_CELL}`}>
            {dataset.reference}
          </span>
          <span className={`text-right font-mono ${WIDE_CELL}`}>
            {dataset.accession_count?.toLocaleString("en-US")}
          </span>
          <span className={WIDE_CELL} />
          <ArrowRightIcon className="size-[13px] justify-self-end text-muted-foreground sm:justify-self-auto" />
        </Link>
      ))}
    </>
  )
}

/** Shows `state.error` from a redirect (e.g. New dataset with no builder) once. */
function useRedirectError() {
  const location = useLocation()
  const navigate = useNavigate()
  const shown = useRef<string | null>(null)
  const error = (location.state as { error?: string } | null)?.error

  useEffect(() => {
    if (!error || shown.current === location.key) return
    shown.current = location.key
    toast.error(error)
    // Drop the state so a reload or Back does not show it again.
    navigate(".", { replace: true, state: null })
  }, [error, location.key, navigate])
}

export function HomePage() {
  useRedirectError()
  // Visitors without the login see the published datasets and nothing to
  // manage them with; the builder would refuse them anyway.
  const { canManage, isPending: sessionPending } = useSession()
  const managed = useQuery({ ...datasetsQuery, enabled: canManage })
  const drafts = useQuery({ ...draftsQuery, enabled: canManage })
  const builderDown = canManage && managed.isError

  const datasets = managed.data ?? []
  const openDrafts = (drafts.data ?? []).filter(
    (draft) => draft.build_id == null
  )
  const empty =
    canManage &&
    managed.isSuccess &&
    datasets.length === 0 &&
    openDrafts.length === 0

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto flex max-w-[860px] flex-col gap-8 px-4 pt-8 pb-[calc(2.5rem+env(safe-area-inset-bottom))] sm:px-6 sm:pt-14">
        <div className="flex flex-col gap-2">
          <h1 className="text-[26px] leading-tight font-semibold">
            Compare genomes along a chromosome
          </h1>
          <p className="max-w-[640px] text-sm text-muted-foreground">
            Tersect Browser shows how far every accession in a dataset is from a
            reference you choose, bin by bin, beside a tree of their similarity.
            Use it to find introgressions, then drill into the genes and
            variants behind them.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="caption">Datasets</h2>
            {builderDown && (
              <span className="text-t11 text-muted-foreground">
                {BUILDER_DOWN} Datasets cannot be added or changed here.
              </span>
            )}
            <span className={canManage ? "ml-auto flex gap-2" : "hidden"}>
              {builderDown ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled
                  title={BUILDER_DOWN}
                >
                  <HistoryIcon /> Builds
                </Button>
              ) : (
                <Button size="sm" variant="outline" asChild>
                  <Link to="/builds">
                    <HistoryIcon /> Builds
                  </Link>
                </Button>
              )}
              <NewDatasetButton disabled={builderDown} />
            </span>
          </div>

          {empty ? (
            <EmptyDatasets />
          ) : (
            <section className="overflow-hidden rounded-xl border bg-card">
              <div className={`${GRID} caption border-b py-2 max-sm:hidden`}>
                <span>Dataset</span>
                <span>Reference</span>
                <span className="text-right">Accessions</span>
                <span>Status</span>
                <span className="sr-only">Actions</span>
              </div>
              {sessionPending ? (
                <LoadingRows />
              ) : builderDown || !canManage ? (
                <PublishedList />
              ) : (
                <>
                  {managed.isPending && <LoadingRows />}
                  {datasets.map((dataset) => (
                    <DatasetRow key={dataset.id} dataset={dataset} />
                  ))}
                  {openDrafts.map((draft) => (
                    <DraftRow key={draft.id} draft={draft} />
                  ))}
                </>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  )
}

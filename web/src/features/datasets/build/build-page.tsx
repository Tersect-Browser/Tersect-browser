import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  ArrowRightIcon,
  BotIcon,
  DownloadIcon,
  RotateCwIcon,
  WrenchIcon,
} from "lucide-react"
import { useEffect, type ReactNode } from "react"
import { Link, useParams } from "react-router"
import { toast } from "sonner"

import { useDatasets } from "@/components/app-shell"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

import {
  buildManifestUrl,
  buildQuery,
  cancelBuild,
  datasetsQuery,
  draftQuery,
  retryBuild,
} from "../api"
import { useAssistantConfig } from "../assistant/config"
import { formatCount, formatDuration } from "../format"
import type { Build, BuildError } from "../types"
import { useSetListed } from "../home/use-set-listed"
import { useWizardStore } from "../wizard-store"
import { Switch } from "../wizard/switch"
import { WizardShell } from "../wizard/wizard-shell"
import { BuildLog } from "./build-log"
import { BuildStepper } from "./build-stepper"
import { BuildStatusBadge } from "./status-badge"
import { currentStage, isLive, stageName, useBuild, useTick } from "./use-build"

/* ------------------------------------------------------------ helpers -- */

const draftUrl = (
  draftId: string,
  params: Record<string, string | null | undefined>
) => {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params))
    if (value) search.set(key, value)
  const query = search.toString()
  return `/datasets/drafts/${encodeURIComponent(draftId)}${query ? `?${query}` : ""}`
}

const escapeRegExp = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/**
 * The pipeline's message with accession, file and contig names in mono: the
 * names the error points at, plus anything the message quotes.
 */
function PipelineMessage({ error }: { error: BuildError }) {
  const names = [error.accession, error.file, error.chromosome]
    .filter((name): name is string => !!name)
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
  const pattern = new RegExp(
    `(${[...names, "`[^`]+`", "'[^'\\s]+'", '"[^"\\s]+"'].join("|")})`,
    "g"
  )
  const parts = error.message.split(pattern)
  return (
    <p className="break-words">
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <code key={index} className="font-mono text-t11">
            {part.replace(/^[`'"]|[`'"]$/g, "")}
          </code>
        ) : (
          part
        )
      )}
    </p>
  )
}

function Note({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-muted/50 px-3 py-2 text-muted-foreground",
        className
      )}
    >
      {children}
    </div>
  )
}

/* -------------------------------------------------------------- cards -- */

function FailedCard({ build }: { build: Build }) {
  const queryClient = useQueryClient()
  const assistant = useAssistantConfig()
  const error = build.error
  const stage = stageName(error?.stage ?? currentStage(build)?.key)
  const retry = useMutation({
    mutationFn: () => retryBuild(build.id),
    onSuccess: (next) =>
      queryClient.setQueryData(buildQuery(build.id).queryKey, next),
    onError: (e: Error) =>
      toast.error(`Could not retry the build: ${e.message}`),
  })

  const rows = [
    ["Accession", error?.accession],
    ["File", error?.file],
    ["Chromosome", error?.chromosome],
  ].filter((row): row is [string, string] => !!row[1])

  return (
    <section
      role="alert"
      className="flex flex-col gap-2.5 rounded-xl border border-destructive bg-[color-mix(in_oklch,var(--destructive)_7%,transparent)] p-3"
    >
      <h3 className="font-semibold text-destructive">{stage} failed</h3>
      {error && <PipelineMessage error={error} />}
      {rows.length > 0 && (
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 sm:grid-cols-[6rem_minmax(0,1fr)]">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="min-w-0 truncate font-mono text-t11">{value}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {build.draft_id ? (
          <Button size="sm" asChild>
            <Link
              to={draftUrl(build.draft_id, {
                fix: error?.fix?.kind,
                target: error?.fix?.target,
                step: error?.fix?.step ?? "review",
              })}
            >
              <WrenchIcon /> Fix and retry
            </Link>
          </Button>
        ) : (
          <Button size="sm" disabled title="This build has no draft to edit">
            <WrenchIcon /> Fix and retry
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={retry.isPending}
          onClick={() => retry.mutate()}
        >
          <RotateCwIcon /> Retry
        </Button>
        {assistant.enabled && build.draft_id && (
          <Button size="sm" variant="outline" asChild>
            <Link to={draftUrl(build.draft_id, { assistant: "error" })}>
              <BotIcon /> Ask the assistant
            </Link>
          </Button>
        )}
      </div>
      <p className="text-t11 text-muted-foreground">
        Finished steps are kept, so a retry resumes at {stage} and is fast.
      </p>
    </section>
  )
}

function CancelledNote({ build }: { build: Build }) {
  const queryClient = useQueryClient()
  const stage = stageName(currentStage(build)?.key)
  const resume = useMutation({
    mutationFn: () => retryBuild(build.id),
    onSuccess: (next) =>
      queryClient.setQueryData(buildQuery(build.id).queryKey, next),
    onError: (e: Error) =>
      toast.error(`Could not resume the build: ${e.message}`),
  })
  return (
    <Note className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className="min-w-0 flex-1">
        Cancelled during {stage}. Finished steps are kept, so resuming starts at{" "}
        {stage}.
      </span>
      <span className="flex flex-wrap gap-2">
        {build.draft_id && (
          <Button size="sm" variant="outline" asChild>
            <Link to={draftUrl(build.draft_id, { step: "review" })}>
              Back to review
            </Link>
          </Button>
        )}
        <Button
          size="sm"
          disabled={resume.isPending}
          onClick={() => resume.mutate()}
        >
          <RotateCwIcon /> Resume build
        </Button>
      </span>
    </Note>
  )
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-xl border bg-card px-3 py-2">
      <span className="caption">{label}</span>
      <span className="truncate font-mono text-[18px] leading-tight">
        {value}
      </span>
    </div>
  )
}

/** Show the new dataset in the public list, or keep it unlisted. */
function ListedSwitch({
  datasetId,
  listed,
}: {
  datasetId: string
  listed: boolean
}) {
  const setListed = useSetListed(datasetId)
  const checked = setListed.isPending ? !!setListed.variables : listed
  return (
    <div className="flex items-start gap-2.5 rounded-md border bg-card px-3 py-2">
      <Switch
        id="dataset-listed"
        className="mt-px"
        checked={checked}
        disabled={setListed.isPending}
        onCheckedChange={(on) => setListed.mutate(on)}
      />
      <label htmlFor="dataset-listed" className="flex flex-col gap-0.5">
        <span className="font-medium">Listed</span>
        <span className="text-muted-foreground">
          {checked
            ? "Shown in the dataset list for everyone using this server."
            : "Hidden from the dataset list. Share links still open it; list it again from Home."}
        </span>
      </label>
    </div>
  )
}

function DoneCard({ build }: { build: Build }) {
  const managed = useQuery(datasetsQuery)
  const published = useDatasets()
  // The view id is assigned when the dataset is published; look it up.
  const viewId =
    build.view_id ??
    managed.data?.find((d) => d.id === build.dataset_id)?.view_id ??
    published.data?.find((d) => d.dataset_id === build.dataset_id)?.view_id
  const summary = build.summary
  const dataset = managed.data?.find((d) => d.id === build.dataset_id)

  return (
    <section className="flex flex-col gap-3">
      <p>
        <span className="font-mono">{build.dataset_id}</span> is published. Open
        it to compare accessions along a chromosome.
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Figure
          label="Accessions"
          value={summary ? formatCount(summary.accessions) : "—"}
        />
        <Figure
          label="Variants"
          value={
            summary?.variants != null ? formatCount(summary.variants) : "—"
          }
        />
        <Figure
          label="Chromosomes"
          value={summary ? formatCount(summary.chromosomes) : "—"}
        />
        <Figure
          label="Time taken"
          value={formatDuration(summary?.duration ?? build.elapsed)}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {viewId ? (
          <Button asChild>
            <Link to={`/share/${viewId}`}>
              Open in browser <ArrowRightIcon />
            </Link>
          </Button>
        ) : (
          <Button disabled>
            Open in browser <ArrowRightIcon />
          </Button>
        )}
        <Button variant="outline" asChild>
          <a
            href={buildManifestUrl(build.id)}
            download={`${build.dataset_id}.yaml`}
          >
            <DownloadIcon /> Download manifest (YAML)
          </a>
        </Button>
        {!viewId && !managed.isPending && !published.isPending && (
          <span className="text-t11 text-muted-foreground">
            The dataset is not listed yet. It opens from Home once it is.
          </span>
        )}
      </div>
      {dataset?.view_id && (
        <ListedSwitch datasetId={dataset.id} listed={dataset.listed} />
      )}
    </section>
  )
}

/* ------------------------------------------------------------- header -- */

function BuildHeader({ build, tick }: { build: Build; tick: number }) {
  const queryClient = useQueryClient()
  const cancel = useMutation({
    mutationFn: () => cancelBuild(build.id),
    onSuccess: (next) =>
      queryClient.setQueryData(buildQuery(build.id).queryKey, next),
    onError: (e: Error) =>
      toast.error(`Could not cancel the build: ${e.message}`),
  })
  const elapsed = build.elapsed != null ? build.elapsed + tick : null

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <h2 className="min-w-0 truncate text-[18px] leading-tight font-semibold">
        {build.dataset_id}
      </h2>
      <BuildStatusBadge build={build} />
      {elapsed != null && (
        <span
          className="font-mono text-t11 text-muted-foreground"
          aria-label={`Elapsed ${formatDuration(elapsed)}`}
        >
          {formatDuration(elapsed)}
        </span>
      )}
      {isLive(build.status) && (
        <Button
          size="sm"
          variant="outline"
          className="ml-auto"
          disabled={cancel.isPending}
          onClick={() => cancel.mutate()}
        >
          Cancel build
        </Button>
      )}
    </div>
  )
}

/* --------------------------------------------------------------- page -- */

function BuildContent({
  build,
  receivedAt,
}: {
  build: Build
  receivedAt: number
}) {
  const running = build.status === "running"
  const tick = useTick(running, receivedAt)

  return (
    <div className="mx-auto flex w-full max-w-[680px] flex-col gap-4 px-5 py-5 max-sm:px-4 max-sm:pb-[calc(1.75rem+env(safe-area-inset-bottom))]">
      <BuildHeader build={build} tick={tick} />

      {build.status === "queued" && (
        <Note>
          {build.queue_position != null ? (
            <>
              Waiting in the queue, position{" "}
              <span className="font-mono">{build.queue_position}</span>.{" "}
            </>
          ) : (
            "Waiting in the queue. "
          )}
          {build.ahead ? (
            <>
              <span className="font-mono">{build.ahead}</span> is building now;
              this build starts when it finishes.
            </>
          ) : (
            "This build starts when the one ahead finishes."
          )}
        </Note>
      )}
      {running && (
        <Note>
          You can leave this page. The build keeps running on the server, and
          Builds shows its progress.
        </Note>
      )}
      {build.rebuild && isLive(build.status) && (
        <Note>
          The current version of{" "}
          <span className="font-mono">{build.dataset_id}</span> stays available
          in the browser until this one is published.
        </Note>
      )}
      {build.status === "cancelled" && <CancelledNote build={build} />}
      {build.status === "failed" && <FailedCard build={build} />}
      {build.status === "succeeded" && <DoneCard build={build} />}

      <BuildStepper stages={build.stages} tick={tick} />
      <BuildLog log={build.log} live={isLive(build.status)} />
    </div>
  )
}

function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-[680px] flex-col gap-4 px-5 py-5 max-sm:px-4">
      <Skeleton className="h-6 w-56" />
      {[0, 1, 2, 3, 4, 5, 6].map((row) => (
        <Skeleton key={row} className="h-[18px] w-full" />
      ))}
    </div>
  )
}

/** /builds/:buildId: the build view and, once it succeeds, Done. */
export function BuildPage() {
  const { buildId = "" } = useParams()
  const build = useBuild(buildId)
  const draftId = build.data?.draft_id ?? null
  // The draft is deleted when the build succeeds; the shell then shows no summary.
  const draft = useQuery({
    ...draftQuery(draftId ?? ""),
    enabled: !!draftId,
    retry: false,
  })

  // The shell's rail and summary read the draft from the wizard store.
  useEffect(() => {
    if (!draft.data) return
    useWizardStore.getState().open(draft.data)
    return () => useWizardStore.getState().close()
  }, [draft.data])

  const done = build.data?.status === "succeeded"

  return (
    <WizardShell
      current={done ? "done" : "build"}
      locked
      title={done ? "Done" : "Build"}
    >
      {build.isPending && <Loading />}
      {build.isError && (
        <div className="mx-auto flex max-w-[680px] flex-col items-start gap-2 px-5 py-8 max-sm:px-4">
          <div className="text-sm font-semibold">
            This build could not be loaded
          </div>
          <p className="text-muted-foreground">{build.error.message}</p>
          <Button size="sm" variant="outline" asChild>
            <Link to="/builds">All builds</Link>
          </Button>
        </div>
      )}
      {build.data && (
        <BuildContent build={build.data} receivedAt={build.dataUpdatedAt} />
      )}
    </WizardShell>
  )
}

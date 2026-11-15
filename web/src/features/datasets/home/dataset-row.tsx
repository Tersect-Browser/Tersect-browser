import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
  DownloadIcon,
  EllipsisIcon,
  ExternalLinkIcon,
  EyeIcon,
  EyeOffIcon,
  RefreshCwIcon,
  Trash2Icon,
  UserPlusIcon,
} from "lucide-react"
import { useState } from "react"
import { Link, useNavigate } from "react-router"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

import {
  addAccessionsDraft,
  datasetManifestUrl,
  deleteDataset,
  rebuildDataset,
} from "../api"
import { DatasetStatusBadge, StatusBadge } from "../build/status-badge"
import { formatCount } from "../format"
import type { ManagedDataset } from "../types"
import { ROW } from "./layout"
import { useSetListed } from "./use-set-listed"

/** Refresh every list that shows datasets after one changes. */
export function invalidateDatasetLists(
  queryClient: ReturnType<typeof useQueryClient>
) {
  void queryClient.invalidateQueries({ queryKey: ["builder"] })
  void queryClient.invalidateQueries({ queryKey: ["datasets"] })
}

/** Badge, plus a link to the build while building or after a failure. */
function StatusCell({ dataset }: { dataset: ManagedDataset }) {
  const badge = (
    <DatasetStatusBadge status={dataset.status} progress={dataset.progress} />
  )
  if (!dataset.build_id || dataset.status === "ready") return badge
  const to = `/builds/${encodeURIComponent(dataset.build_id)}`
  const label =
    dataset.status === "failed" ? "See why the build failed" : "Open the build"
  return (
    <Link
      to={to}
      aria-label={label}
      className="relative z-10 flex w-fit flex-col gap-[3px] rounded-full hover:opacity-80"
    >
      {badge}
      {dataset.status === "building" && (
        <span
          aria-hidden
          className="h-[3px] w-full overflow-hidden rounded-full bg-muted"
        >
          <span
            className="block h-full rounded-full bg-primary transition-[width]"
            style={{
              width: `${Math.min(100, Math.max(0, dataset.progress ?? 0))}%`,
            }}
          />
        </span>
      )}
    </Link>
  )
}

function DeleteDialog({
  dataset,
  open,
  onOpenChange,
}: {
  dataset: ManagedDataset
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const remove = useMutation({
    mutationFn: () => deleteDataset(dataset.id),
    onSuccess: () => {
      toast.success(`${dataset.id} was deleted`)
      onOpenChange(false)
    },
    onError: (e: Error) =>
      toast.error(`Could not delete ${dataset.id}: ${e.message}`),
    onSettled: () => invalidateDatasetLists(queryClient),
  })
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-sm font-semibold">
            Delete <span className="font-mono">{dataset.id}</span>?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-xs">
            It will be removed from the browser, along with its shared links.
            Files on disk are kept.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel size="sm">Cancel</AlertDialogCancel>
          <AlertDialogAction
            size="sm"
            variant="destructive"
            disabled={remove.isPending}
            onClick={(event) => {
              // Keep the dialog open until the server answers.
              event.preventDefault()
              remove.mutate()
            }}
          >
            Delete dataset
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function ActionsMenu({ dataset }: { dataset: ManagedDataset }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [deleting, setDeleting] = useState(false)
  const building = dataset.status === "building"
  const setListed = useSetListed(dataset.id)
  const published = !!dataset.view_id

  const add = useMutation({
    mutationFn: () => addAccessionsDraft(dataset.id),
    onSuccess: (draft) => {
      void queryClient.invalidateQueries({ queryKey: ["builder", "drafts"] })
      navigate(`/datasets/drafts/${encodeURIComponent(draft.id)}`)
    },
    onError: (e: Error) =>
      toast.error(`Could not add accessions: ${e.message}`),
  })
  const rebuild = useMutation({
    mutationFn: () => rebuildDataset(dataset.id),
    onSuccess: ({ id }) => {
      invalidateDatasetLists(queryClient)
      navigate(`/builds/${encodeURIComponent(id)}`)
    },
    onError: (e: Error) =>
      toast.error(`Could not rebuild ${dataset.id}: ${e.message}`),
  })

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            className="relative z-10"
            aria-label={`Actions for ${dataset.id}`}
          >
            <EllipsisIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem
            disabled={!dataset.view_id}
            asChild={!!dataset.view_id}
          >
            {dataset.view_id ? (
              <Link to={`/share/${dataset.view_id}`}>
                <ExternalLinkIcon /> Open
              </Link>
            ) : (
              <>
                <ExternalLinkIcon /> Open
              </>
            )}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!dataset.has_manifest || building || add.isPending}
            onSelect={() => add.mutate()}
          >
            <UserPlusIcon /> Add accessions
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!dataset.has_manifest || building || rebuild.isPending}
            onSelect={() => rebuild.mutate()}
          >
            <RefreshCwIcon /> Rebuild
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!dataset.has_manifest}
            asChild={dataset.has_manifest}
          >
            {dataset.has_manifest ? (
              <a
                href={datasetManifestUrl(dataset.id)}
                download={`${dataset.id}.yaml`}
              >
                <DownloadIcon /> Download manifest
              </a>
            ) : (
              <>
                <DownloadIcon /> Download manifest
              </>
            )}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!published || setListed.isPending}
            onSelect={() => setListed.mutate(!dataset.listed)}
          >
            {dataset.listed ? (
              <>
                <EyeOffIcon /> Unlist
              </>
            ) : (
              <>
                <EyeIcon /> List
              </>
            )}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => setDeleting(true)}
          >
            <Trash2Icon /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DeleteDialog
        dataset={dataset}
        open={deleting}
        onOpenChange={setDeleting}
      />
    </>
  )
}

/**
 * A published dataset. The name is a link stretched over the row, so the
 * whole row opens the dataset; the badge link and the menu sit above it.
 */
export function DatasetRow({ dataset }: { dataset: ManagedDataset }) {
  const openable = !!dataset.view_id && dataset.status !== "building"
  const unlisted = !!dataset.view_id && !dataset.listed
  const name = (
    <span className="block truncate text-sm font-semibold">{dataset.id}</span>
  )
  return (
    <div className={`${ROW} relative ${openable ? "hover:bg-accent" : ""}`}>
      <span className="min-w-0">
        {openable ? (
          <Link
            to={`/share/${dataset.view_id}`}
            className="outline-none after:absolute after:inset-0 focus-visible:underline"
          >
            {name}
          </Link>
        ) : (
          name
        )}
        {unlisted && (
          <span
            className="relative z-10 mt-0.5 flex items-center gap-1.5"
            title="Not in the public dataset list. Share links still open it."
          >
            <StatusBadge tone="muted" icon={<EyeOffIcon />}>
              Unlisted
            </StatusBadge>
          </span>
        )}
        {dataset.description && (
          <span className="block truncate text-muted-foreground">
            {dataset.description}
          </span>
        )}
      </span>
      <span className="truncate font-mono">{dataset.reference}</span>
      <span className="text-right font-mono">
        {formatCount(dataset.accessions)}
      </span>
      <StatusCell dataset={dataset} />
      <ActionsMenu dataset={dataset} />
    </div>
  )
}

import { useQuery } from "@tanstack/react-query"
import {
  ChevronRightIcon,
  FileIcon,
  FolderIcon,
  RotateCwIcon,
} from "lucide-react"
import { useState } from "react"
import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

import { listServerFolder } from "../api"
import { formatBytes } from "../format"
import type { ServerEntry } from "../types"
import { plural } from "./accessions-shared"

interface ServerFolderDialogProps {
  open: boolean
  onOpenChange(open: boolean): void
  multiple: boolean
  accept: (name: string) => boolean
  title?: string
  onPick(entries: ServerEntry[]): void
}

/** 7b: pick files the server shares; they are read in place. */
export function ServerFolderDialog({
  open,
  onOpenChange,
  title = "Choose from a server folder",
  ...props
}: ServerFolderDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 p-0 sm:max-w-[540px]">
        <DialogHeader className="border-b px-3.5 py-3">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {open && (
          <FolderBrowser {...props} onClose={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function FolderBrowser({
  multiple,
  accept,
  onPick,
  onClose,
}: Omit<ServerFolderDialogProps, "open" | "onOpenChange" | "title"> & {
  onClose: () => void
}) {
  // Folders entered from the shared roots; the breadcrumb walks back along it.
  const [trail, setTrail] = useState<ServerEntry[]>([])
  const [selected, setSelected] = useState<Map<string, ServerEntry>>(new Map())
  const path = trail.at(-1)?.path ?? ""

  const folder = useQuery({
    queryKey: ["builder", "server-files", path],
    queryFn: ({ signal }) => listServerFolder(path, signal),
    retry: false,
  })

  const toggle = (entry: ServerEntry) => {
    const next = new Map(multiple ? selected : [])
    if (selected.has(entry.path)) next.delete(entry.path)
    else next.set(entry.path, entry)
    setSelected(next)
  }
  const picked = [...selected.values()]
  const total = picked.reduce((sum, e) => sum + (e.size ?? 0), 0)
  const pick = (entries: ServerEntry[]) => {
    onPick(entries)
    onClose()
  }

  const entries = [...(folder.data?.entries ?? [])].sort(
    (a, b) =>
      (a.kind === b.kind ? 0 : a.kind === "dir" ? -1 : 1) ||
      a.name.localeCompare(b.name, undefined, { numeric: true })
  )

  return (
    <>
      <nav
        aria-label="Folder path"
        className="flex min-w-0 flex-wrap items-center gap-0.5 border-b px-3 py-1.5 font-mono text-[11px]"
      >
        <Crumb current={trail.length === 0} onClick={() => setTrail([])}>
          Shared folders
        </Crumb>
        {trail.map((dir, i) => (
          <span key={dir.path} className="flex min-w-0 items-center gap-0.5">
            <ChevronRightIcon className="size-3 shrink-0 text-muted-foreground" />
            <Crumb
              current={i === trail.length - 1}
              onClick={() => setTrail(trail.slice(0, i + 1))}
            >
              {i === 0 ? dir.path : dir.name}
            </Crumb>
          </span>
        ))}
      </nav>

      <div
        className="h-[300px] overflow-y-auto py-1"
        role="listbox"
        aria-multiselectable={multiple}
      >
        {folder.isPending ? (
          <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
            <Spinner className="size-3.5" /> Listing folder…
          </div>
        ) : folder.isError ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <p className="text-destructive">
              Could not list this folder: {folder.error.message}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => folder.refetch()}
            >
              <RotateCwIcon /> Try again
            </Button>
          </div>
        ) : entries.length === 0 ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-muted-foreground">
            {path
              ? "This folder is empty."
              : "The server does not share any folders."}
          </div>
        ) : (
          entries.map((entry) =>
            entry.kind === "dir" ? (
              <button
                key={entry.path}
                type="button"
                className="flex h-6 w-full items-center gap-2 px-3 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                onClick={() => setTrail([...trail, entry])}
              >
                <span className="size-4 shrink-0" />
                <FolderIcon className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate font-mono">
                  {entry.name}
                </span>
                <ChevronRightIcon className="size-3 shrink-0 text-muted-foreground" />
              </button>
            ) : (
              <FileRow
                key={entry.path}
                entry={entry}
                multiple={multiple}
                accepted={accept(entry.name)}
                checked={selected.has(entry.path)}
                onToggle={() => toggle(entry)}
                onPick={() => pick([entry])}
              />
            )
          )
        )}
      </div>

      <p className="border-t px-3.5 py-2 text-[11px] text-muted-foreground">
        Only folders the server is configured to share are listed. Files are
        read in place; nothing is uploaded or copied.
      </p>
      <DialogFooter className="mx-0 mb-0 items-center sm:justify-between">
        <span className="font-mono text-[11px] text-muted-foreground">
          {picked.length
            ? `${picked.length} selected · ${formatBytes(total)}`
            : "None selected"}
        </span>
        <div className="flex gap-1.5">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!picked.length}
            onClick={() => pick(picked)}
          >
            {multiple ? `Add ${plural(picked.length, "file")}` : "Choose file"}
          </Button>
        </div>
      </DialogFooter>
    </>
  )
}

function Crumb({
  current,
  onClick,
  children,
}: {
  current: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-current={current ? "location" : undefined}
      className={cn(
        "max-w-[240px] truncate rounded-sm px-1 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none",
        current ? "font-medium text-foreground" : "text-muted-foreground"
      )}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function FileRow({
  entry,
  multiple,
  accepted,
  checked,
  onToggle,
  onPick,
}: {
  entry: ServerEntry
  multiple: boolean
  accepted: boolean
  checked: boolean
  onToggle: () => void
  onPick: () => void
}) {
  const id = `server-file-${entry.path}`
  return (
    <div
      role="option"
      aria-selected={checked}
      aria-disabled={!accepted}
      className={cn(
        "flex h-6 items-center gap-2 px-3",
        accepted ? "hover:bg-accent" : "text-muted-foreground opacity-60",
        checked && "bg-accent"
      )}
      onDoubleClick={accepted && !multiple ? onPick : undefined}
    >
      <Checkbox
        id={id}
        checked={checked}
        disabled={!accepted}
        onCheckedChange={onToggle}
        className={multiple ? undefined : "rounded-full"}
      />
      <FileIcon className="size-3.5 shrink-0 text-muted-foreground" />
      <label
        htmlFor={id}
        className={cn(
          "min-w-0 flex-1 truncate font-mono",
          accepted && "cursor-pointer"
        )}
        title={entry.name}
      >
        {entry.name}
      </label>
      <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
        {formatBytes(entry.size)}
      </span>
    </div>
  )
}

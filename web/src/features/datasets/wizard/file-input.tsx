import { useMutation, useQuery } from "@tanstack/react-query"
import {
  CircleAlertIcon,
  FileIcon,
  FolderIcon,
  GlobeIcon,
  LinkIcon,
  PauseIcon,
  PlayIcon,
  RotateCwIcon,
  UploadIcon,
  XIcon,
} from "lucide-react"
import { useEffect, useId, useRef, useState } from "react"
import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

import { checkUrls, configQuery, inspectFile } from "../api"
import { fileNameOf, formatBytes, formatSpeed, formatTimeLeft } from "../format"
import type {
  FileKind,
  FileRef,
  FileSource,
  InspectResult,
  ServerEntry,
} from "../types"
import { useUploadFor, useUploads, type UploadItem } from "../uploads"
import { Segmented } from "./segmented"
import { ServerFolderDialog } from "./server-folder-dialog"

/* ----------------------------------------------------------- pieces -- */

type BadgeTone = "accent" | "muted" | "destructive"

export function StateBadge({
  tone,
  children,
}: {
  tone: BadgeTone
  children: ReactNode
}) {
  return (
    <span
      className={cn(
        "inline-flex h-[18px] shrink-0 items-center rounded-full px-1.5 text-t10 font-medium whitespace-nowrap",
        tone === "accent" && "bg-accent text-accent-foreground",
        tone === "muted" && "bg-muted text-muted-foreground",
        tone === "destructive" && "bg-destructive/10 text-destructive"
      )}
    >
      {children}
    </span>
  )
}

const SOURCE_ICONS: Record<FileSource, typeof FileIcon> = {
  upload: FileIcon,
  url: GlobeIcon,
  server: FolderIcon,
}

/** "fa,.fasta" → [".fa", ".fasta"] */
function acceptList(accept: string) {
  return accept
    .split(",")
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean)
}

export function matchesAccept(name: string, accept: string) {
  const list = acceptList(accept)
  return (
    list.length === 0 ||
    list.some((suffix) => name.toLowerCase().endsWith(suffix))
  )
}

/** Key the upload store uses for a File (see uploads.ts). */
const uploadKey = (file: File) =>
  `${file.name}:${file.size}:${file.lastModified}`

function IconAction({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
    </Button>
  )
}

/* -------------------------------------------------------------- row -- */

function FileRow({
  source,
  name,
  location,
  size,
  badge,
  actions,
  children,
}: {
  source: FileSource
  name: string
  location: string
  size: number | null | undefined
  badge?: ReactNode
  actions?: ReactNode
  children?: ReactNode
}) {
  const Icon = SOURCE_ICONS[source]
  return (
    <div className="flex flex-col gap-1 rounded-xl border bg-card px-2.5 py-2">
      {/* Phones: icon, name and actions on one line; location, then size and
          state beneath. */}
      <div className="flex min-w-0 items-center gap-2 max-sm:flex-wrap max-sm:gap-y-0.5">
        <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <span
          className="min-w-0 shrink truncate font-mono font-medium max-sm:flex-1 max-sm:basis-0"
          title={name}
        >
          {name}
        </span>
        <span
          className="min-w-0 flex-1 truncate font-mono text-t11 text-muted-foreground max-sm:order-2 max-sm:flex-none max-sm:basis-full max-sm:pl-[22px]"
          title={location}
        >
          {location}
        </span>
        <span className="shrink-0 font-mono text-t11 text-muted-foreground max-sm:order-3 max-sm:pl-[22px] max-sm:empty:hidden">
          {size != null ? formatBytes(size) : ""}
        </span>
        {badge && (
          <span className="flex min-w-0 shrink-0 items-center max-sm:order-3 max-sm:shrink">
            {badge}
          </span>
        )}
        <div className="flex shrink-0 items-center max-sm:order-1">
          {actions}
        </div>
      </div>
      {children && (
        <div className="flex flex-col gap-1 pl-[22px]">{children}</div>
      )}
    </div>
  )
}

function UploadProgress({ item }: { item: UploadItem }) {
  const percent = item.size > 0 ? Math.round((item.sent / item.size) * 100) : 0
  const parts = [`${percent}% of ${formatBytes(item.size)}`]
  if (item.status === "uploading" && item.speed > 0) {
    parts.push(formatSpeed(item.speed))
    const left = formatTimeLeft((item.size - item.sent) / item.speed)
    if (left) parts.push(left)
  }
  return (
    <div className="flex flex-col gap-1">
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label={`Upload of ${item.name}`}
        className="h-[3px] overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn(
            "h-full transition-[width]",
            item.status === "failed"
              ? "bg-destructive"
              : item.status === "uploading"
                ? "bg-primary"
                : "bg-muted-foreground/60"
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="font-mono text-t11 text-muted-foreground">
        {parts.join(" · ")}
      </div>
    </div>
  )
}

const Message = ({
  tone,
  children,
}: {
  tone: "muted" | "destructive"
  children: ReactNode
}) => (
  <div
    role={tone === "destructive" ? "alert" : undefined}
    className={cn(
      "flex items-start gap-1 text-t11",
      tone === "destructive" ? "text-destructive" : "text-muted-foreground"
    )}
  >
    {tone === "destructive" && (
      <CircleAlertIcon className="mt-px size-3 shrink-0" />
    )}
    <span>{children}</span>
  </div>
)

/* ------------------------------------------------------------ input -- */

export interface FileInputProps {
  kind: FileKind
  value: FileRef | null
  onChange: (ref: FileRef | null) => void
  /** Comma-separated file name endings, e.g. ".fa,.fasta,.fa.gz". */
  accept: string
  /** Text in the empty drop zone, e.g. "Drop the reference FASTA here". */
  dropLabel: string
  help?: ReactNode
  draftId: string
  /** Accessible name of the control, e.g. "Reference FASTA". */
  label: string
  /** The server has read this file already (its results are in the form). */
  inspected?: boolean
  /** Called with what the server read once the file is available. */
  onInspect?: (result: InspectResult) => void
}

/**
 * One input file from an upload, a URL or a server folder. Shows the file row
 * with upload progress once chosen, and has the server read it (inspect) as
 * soon as it is available.
 */
export function FileInput({
  kind,
  value,
  onChange,
  accept,
  dropLabel,
  help,
  draftId,
  label,
  inspected = false,
  onInspect,
}: FileInputProps) {
  const id = useId()
  const [source, setSource] = useState<FileSource>("upload")
  const [folderOpen, setFolderOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [startingKey, setStartingKey] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [url, setUrl] = useState("")
  const browseRef = useRef<HTMLInputElement>(null)
  const repickRef = useRef<HTMLInputElement>(null)

  const config = useQuery(configQuery)
  const add = useUploads((s) => s.add)
  const pause = useUploads((s) => s.pause)
  const resume = useUploads((s) => s.resume)
  const removeUpload = useUploads((s) => s.remove)
  const item = useUploadFor(value)
  const startingItem = useUploads((s) =>
    startingKey ? s.items[startingKey] : undefined
  )

  /* inspect once the server has the whole file */
  const available =
    value !== null &&
    (value.source !== "upload" ||
      item === undefined ||
      item.status === "verified")
  const inspect = useQuery({
    queryKey: ["builder", "inspect", kind, value],
    queryFn: ({ signal }) => inspectFile(value!, kind, signal),
    enabled: available && !inspected,
    staleTime: Infinity,
    retry: false,
  })
  const reported = useRef(0)
  useEffect(() => {
    if (inspect.data && inspect.dataUpdatedAt !== reported.current) {
      reported.current = inspect.dataUpdatedAt
      onInspect?.(inspect.data)
    }
  }, [inspect.data, inspect.dataUpdatedAt, onInspect])

  const urlCheck = useMutation({
    mutationFn: (link: string) =>
      checkUrls([link]).then((results) => results[0]),
    onSuccess: (result, link) => {
      if (result?.ok) {
        onChange({
          source: "url",
          location: link,
          name: fileNameOf(link),
          size: result.size,
        })
        setUrl("")
      }
    },
  })

  const startUpload = (file: File) => {
    setError(null)
    if (!matchesAccept(file.name, accept)) {
      setError(`${file.name} is not one of: ${acceptList(accept).join(", ")}.`)
      return
    }
    const max = config.data?.max_upload
    if (max != null && file.size > max) {
      setError(
        `${file.name} is ${formatBytes(file.size)}; the server takes uploads up to ${formatBytes(max)}. Use a URL or a server folder instead.`
      )
      return
    }
    setStartingKey(uploadKey(file))
    add(file, draftId).then(
      ({ ref }) => {
        setStartingKey(null)
        onChange(ref)
      },
      // The item stays "failed" in the store; the starting row shows it.
      () => {}
    )
  }

  // Retried after failing before creation: report the upload once it exists.
  // (The filled row takes over from the starting row; clear() resets the key.)
  const createdId = startingItem?.uploadId ?? null
  useEffect(() => {
    if (!createdId || !startingItem) return
    onChange({
      source: "upload",
      location: createdId,
      name: startingItem.name,
      size: startingItem.size,
    })
  }, [createdId]) // eslint-disable-line react-hooks/exhaustive-deps

  const repick = (file: File) => {
    if (!item) return
    if (uploadKey(file) !== item.key) {
      setError(
        `That is a different file. Choose ${item.name} (${formatBytes(item.size)}).`
      )
      return
    }
    setError(null)
    resume(item.key, file)
  }

  const retry = (upload: UploadItem) => {
    resume(upload.key)
    // After a reload the browser no longer has the file: ask for it again.
    if (useUploads.getState().items[upload.key]?.status === "failed") {
      repickRef.current?.click()
    }
  }

  const clear = () => {
    if (item) removeUpload(item.key)
    setStartingKey(null)
    setError(null)
    onChange(null)
  }

  const pickFromServer = (entries: ServerEntry[]) => {
    const entry = entries[0]
    if (!entry) return
    onChange({
      source: "server",
      location: entry.path,
      name: entry.name,
      size: entry.size,
    })
  }

  const hidden = (
    <>
      <input
        ref={browseRef}
        type="file"
        accept={accept}
        className="hidden"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ""
          if (file) startUpload(file)
        }}
      />
      <input
        ref={repickRef}
        type="file"
        accept={accept}
        className="hidden"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ""
          if (file) repick(file)
        }}
      />
    </>
  )

  const inspectLine = inspect.isFetching ? (
    <Message tone="muted">
      <span className="inline-flex items-center gap-1">
        <Spinner className="size-3" /> Reading the file on the server…
      </span>
    </Message>
  ) : inspect.isError ? (
    <Message tone="destructive">
      The server could not read the file: {inspect.error.message}{" "}
      <button
        type="button"
        className="underline underline-offset-2"
        onClick={() => void inspect.refetch()}
      >
        Try again
      </button>
    </Message>
  ) : inspect.data?.error ? (
    <Message tone="destructive">{inspect.data.error}</Message>
  ) : null

  /* ---------------------------------------------------- filled -- */

  if (value) {
    const read = inspected || (inspect.data && !inspect.data.error)
    let badge: ReactNode = null
    let actions: ReactNode = null
    let detail: ReactNode = null
    let location = value.location

    if (value.source === "upload") {
      location = "uploaded from this computer"
      if (!item) {
        badge = <StateBadge tone="accent">uploaded</StateBadge>
      } else if (item.status === "verified") {
        badge = <StateBadge tone="accent">verified</StateBadge>
      } else {
        detail = (
          <>
            <UploadProgress item={item} />
            {item.status === "needs-file" && (
              <Message tone="muted">
                Choose the file again to resume.{" "}
                <button
                  type="button"
                  className="text-primary underline underline-offset-2"
                  onClick={() => repickRef.current?.click()}
                >
                  Choose {item.name}
                </button>
              </Message>
            )}
            {item.status === "failed" && item.error && (
              <Message tone="destructive">{item.error}</Message>
            )}
          </>
        )
        if (item.status === "uploading") {
          badge = <StateBadge tone="muted">uploading</StateBadge>
          actions = (
            <IconAction
              label={`Pause upload of ${item.name}`}
              onClick={() => pause(item.key)}
            >
              <PauseIcon />
            </IconAction>
          )
        } else if (item.status === "paused") {
          badge = <StateBadge tone="muted">paused</StateBadge>
          actions = (
            <IconAction
              label={`Resume upload of ${item.name}`}
              onClick={() => resume(item.key)}
            >
              <PlayIcon />
            </IconAction>
          )
        } else if (item.status === "needs-file") {
          badge = <StateBadge tone="muted">paused</StateBadge>
          actions = (
            <IconAction
              label={`Choose ${item.name} again to resume`}
              onClick={() => repickRef.current?.click()}
            >
              <PlayIcon />
            </IconAction>
          )
        } else if (item.status === "failed") {
          badge = <StateBadge tone="destructive">failed</StateBadge>
          actions = (
            <IconAction
              label={`Retry upload of ${item.name}`}
              onClick={() => retry(item)}
            >
              <RotateCwIcon />
            </IconAction>
          )
        }
      }
    } else if (value.source === "url") {
      badge = (
        <StateBadge tone={read ? "accent" : "muted"}>
          {read ? "Reachable, index read" : "reachable"}
        </StateBadge>
      )
    } else {
      badge = (
        <StateBadge tone={read ? "accent" : "muted"}>
          {read ? "read" : "on server"}
        </StateBadge>
      )
    }

    const uploading = item && item.status !== "verified"
    return (
      <div className="flex flex-col gap-1" role="group" aria-label={label}>
        {hidden}
        <FileRow
          source={value.source}
          name={value.name}
          location={location}
          size={item?.size ?? value.size}
          badge={badge}
          actions={
            <>
              {actions}
              <IconAction
                label={
                  uploading
                    ? `Cancel upload of ${value.name}`
                    : `Remove ${value.name}`
                }
                onClick={clear}
              >
                <XIcon />
              </IconAction>
            </>
          }
        >
          {detail}
          {inspectLine}
          {error && <Message tone="destructive">{error}</Message>}
        </FileRow>
      </div>
    )
  }

  /* ----------------------------------------------------- empty -- */

  if (startingKey) {
    const failed = startingItem?.status === "failed"
    return (
      <div className="flex flex-col gap-1" role="group" aria-label={label}>
        <FileRow
          source="upload"
          name={startingItem?.name ?? startingKey.split(":")[0]}
          location="this computer"
          size={startingItem?.size}
          badge={
            failed ? (
              <StateBadge tone="destructive">failed</StateBadge>
            ) : (
              <StateBadge tone="muted">starting</StateBadge>
            )
          }
          actions={
            <>
              {failed && (
                <IconAction
                  label="Retry upload"
                  onClick={() => resume(startingKey)}
                >
                  <RotateCwIcon />
                </IconAction>
              )}
              <IconAction
                label="Cancel upload"
                onClick={() => {
                  removeUpload(startingKey)
                  setStartingKey(null)
                }}
              >
                <XIcon />
              </IconAction>
            </>
          }
        >
          {failed ? (
            <Message tone="destructive">
              {startingItem?.error ?? "The upload could not start."} Retry
              starts it again.
            </Message>
          ) : (
            <Message tone="muted">
              <span className="inline-flex items-center gap-1">
                <Spinner className="size-3" /> Starting the upload…
              </span>
            </Message>
          )}
        </FileRow>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1.5" role="group" aria-label={label}>
      {hidden}
      <Segmented<FileSource>
        aria-label={`${label} source`}
        value={source}
        onChange={(next) => {
          setSource(next)
          setError(null)
          if (next === "server") setFolderOpen(true)
        }}
        options={[
          {
            value: "upload",
            label: (
              <>
                <UploadIcon /> Upload
              </>
            ),
          },
          {
            value: "url",
            label: (
              <>
                <LinkIcon /> URL
              </>
            ),
          },
          {
            value: "server",
            label: (
              <>
                <FolderIcon /> Server folder
              </>
            ),
          },
        ]}
        className="self-start"
      />

      {source === "upload" && (
        <div
          onDragOver={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault()
            setDragging(false)
            const file = event.dataTransfer.files[0]
            if (file) startUpload(file)
          }}
          className={cn(
            "flex flex-wrap items-center justify-center gap-2 rounded-xl border border-dashed px-3 py-4 text-center text-muted-foreground transition-colors",
            dragging
              ? "border-primary bg-accent/60 text-foreground"
              : "border-input"
          )}
        >
          <UploadIcon className="size-3.5 shrink-0" aria-hidden />
          <span>{dropLabel}</span>
          <span>or</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => browseRef.current?.click()}
          >
            Browse
          </Button>
        </div>
      )}

      {source === "url" && (
        <form
          className="flex flex-col gap-1"
          onSubmit={(event) => {
            event.preventDefault()
            if (url.trim()) urlCheck.mutate(url.trim())
          }}
        >
          <div className="flex gap-1.5">
            <Input
              id={`${id}-url`}
              aria-label={`${label} URL`}
              type="url"
              inputMode="url"
              placeholder="https://… or ftp://…"
              value={url}
              onChange={(event) => {
                setUrl(event.target.value)
                urlCheck.reset()
              }}
              className="font-mono"
            />
            <Button
              type="submit"
              variant="outline"
              disabled={!url.trim() || urlCheck.isPending}
            >
              {urlCheck.isPending && <Spinner className="size-3" />}
              Check
            </Button>
          </div>
          {urlCheck.isError && (
            <Message tone="destructive">
              Could not check the link: {urlCheck.error.message}
            </Message>
          )}
          {urlCheck.data && !urlCheck.data.ok && (
            <Message tone="destructive">
              Not reachable:{" "}
              {urlCheck.data.error ??
                `status ${urlCheck.data.status ?? "unknown"}`}
            </Message>
          )}
        </form>
      )}

      {source === "server" && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-input px-3 py-3 text-muted-foreground">
          <FolderIcon className="size-3.5 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1 basis-40">
            Files in a folder the server shares are read in place.
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setFolderOpen(true)}
          >
            Choose file
          </Button>
        </div>
      )}

      {error && <Message tone="destructive">{error}</Message>}
      {help && <div className="text-t11 text-muted-foreground">{help}</div>}

      <ServerFolderDialog
        open={folderOpen}
        onOpenChange={setFolderOpen}
        multiple={false}
        accept={(name) => matchesAccept(name, accept)}
        title={`Choose the ${label.toLowerCase()}`}
        onPick={pickFromServer}
      />
    </div>
  )
}

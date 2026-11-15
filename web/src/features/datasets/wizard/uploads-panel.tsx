import { useQuery } from "@tanstack/react-query"
import {
  ChevronDownIcon,
  CircleCheckIcon,
  CircleXIcon,
  FileQuestionIcon,
  LinkIcon,
  PauseIcon,
  PlayIcon,
  RotateCwIcon,
  TriangleAlertIcon,
  UploadIcon,
  XIcon,
} from "lucide-react"
import { useRef, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"

import { storageQuery } from "../api"
import { formatBytes, formatSpeed, formatTimeLeft } from "../format"
import type { FileRef } from "../types"
import {
  uploadTotals,
  useDraftUploads,
  useUploads,
  type UploadItem,
} from "../uploads"
import { useForm, useWizardStore } from "../wizard-store"
import { forgetUpload, removeVcf, usePendingUploads } from "./accessions-shared"

/** "3.1 of 6.8 GB" (one unit when both share it). */
function ofText(sent: number, size: number): string {
  const a = formatBytes(sent)
  const b = formatBytes(size)
  const unit = b.split(" ")[1]
  return a.endsWith(` ${unit}`) ? `${a.split(" ")[0]} of ${b}` : `${a} of ${b}`
}

const percent = (item: UploadItem) =>
  item.size ? Math.min(100, Math.floor((item.sent / item.size) * 100)) : 0

/** Links in the form: nothing to upload, fetched during the build. */
function useUrlFiles(): FileRef[] {
  const form = useForm()
  return [
    form.reference.fasta,
    form.reference.gff,
    form.options.useIndex ? form.options.index : null,
    ...(form.options.useIndex ? [] : form.vcfs.map((v) => v.file)),
  ].filter((ref): ref is FileRef => ref?.source === "url")
}

/** Uploads for the whole draft (FASTA, GFF, index and VCFs) and their links. */
export function UploadsPanel({ className }: { className?: string }) {
  const draftId = useWizardStore((s) => s.draft?.id)
  const items = useDraftUploads(draftId)
  const links = useUrlFiles()
  const [open, setOpen] = useState(true)
  const storage = useQuery(storageQuery)

  if (!items.length && !links.length) return null

  const totals = uploadTotals(items)
  const pendingBytes = items
    .filter((i) => i.status !== "verified")
    .reduce((sum, i) => sum + Math.max(0, i.size - i.sent), 0)
  const tooBig = storage.data !== undefined && pendingBytes > storage.data.free
  const counts = [
    totals.uploading && `${totals.uploading} uploading`,
    totals.paused && `${totals.paused} paused`,
    totals.failed && `${totals.failed} failed`,
  ].filter(Boolean)
  const status = items.length
    ? counts.length
      ? counts.join(", ")
      : "all verified"
    : `${links.length} ${links.length === 1 ? "link" : "links"}`
  const left = totals.uploading ? formatTimeLeft(totals.secondsLeft) : ""

  return (
    <section
      aria-label="Uploads"
      className={cn("overflow-hidden rounded-md border bg-card", className)}
    >
      <button
        type="button"
        aria-expanded={open}
        className="flex h-[30px] w-full items-center gap-2 px-2.5 text-left hover:bg-accent/50 focus-visible:bg-accent focus-visible:outline-none"
        onClick={() => setOpen(!open)}
      >
        <ChevronDownIcon
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-transform",
            !open && "-rotate-90"
          )}
        />
        <span className="caption">Uploads</span>
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">
          {items.length > 0 && `${ofText(totals.sent, totals.size)} · `}
          {status}
        </span>
        {left && (
          <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
            {left}
          </span>
        )}
      </button>
      {items.length > 0 && (
        <Progress
          aria-label="Overall upload progress"
          value={totals.size ? (totals.sent / totals.size) * 100 : 0}
          className="h-[3px] rounded-none"
        />
      )}

      {open && (
        <>
          <ul className="flex flex-col py-0.5">
            {items.map((item) => (
              <UploadRow key={item.key} item={item} />
            ))}
            {links.map((ref) => (
              <LinkRow key={ref.location} file={ref} />
            ))}
          </ul>
          {tooBig && storage.data && (
            <div
              role="alert"
              className="mx-2.5 mb-2 flex items-start gap-2 rounded-md border border-(--viz-variant) bg-(--viz-variant)/10 px-2.5 py-1.5 text-[11px]"
            >
              <TriangleAlertIcon className="mt-px size-3.5 shrink-0 text-(--viz-variant)" />
              <span>
                The uploads still to come ({formatBytes(pendingBytes)}) are more
                than the server has free ({formatBytes(storage.data.free)}).
                Free some space or remove files, or the uploads will fail.
              </span>
            </div>
          )}
          <p className="border-t px-2.5 py-1.5 text-[11px] text-muted-foreground">
            Uploads resume if the connection drops or the page is closed. You
            can keep filling in the form meanwhile; checksums are verified on
            the server.
          </p>
        </>
      )}
    </section>
  )
}

function StateIcon({ item }: { item: UploadItem }) {
  const className = "size-3.5 shrink-0"
  switch (item.status) {
    case "uploading":
      return (
        <UploadIcon
          aria-label="Uploading"
          className={cn(className, "text-primary")}
        />
      )
    case "paused":
      return (
        <PauseIcon
          aria-label="Paused"
          className={cn(className, "text-muted-foreground")}
        />
      )
    case "needs-file":
      return (
        <FileQuestionIcon
          aria-label="Needs the file"
          className={cn(className, "text-muted-foreground")}
        />
      )
    case "failed":
      return (
        <CircleXIcon
          aria-label="Failed"
          className={cn(className, "text-destructive")}
        />
      )
    case "verified":
      return (
        <CircleCheckIcon
          aria-label="Verified"
          className={cn(className, "text-primary")}
        />
      )
  }
}

function statusText(item: UploadItem): string {
  const pct = percent(item)
  switch (item.status) {
    case "uploading": {
      const left =
        item.speed > 0
          ? formatTimeLeft((item.size - item.sent) / item.speed)
          : ""
      return [`${pct}%`, item.speed > 0 && formatSpeed(item.speed), left]
        .filter(Boolean)
        .join(" · ")
    }
    case "paused":
      return `Paused at ${pct}%`
    case "needs-file":
      return `Paused at ${pct}% · choose the file again to resume`
    case "failed":
      return `Upload failed${item.error ? `: ${item.error}` : ""}`
    case "verified":
      return `${formatBytes(item.size)} · verified`
  }
}

function removeUpload(item: UploadItem) {
  const pending = Object.entries(usePendingUploads.getState()).find(
    ([, key]) => key === item.key
  )
  if (pending) removeVcf(pending[0])
  useUploads.getState().remove(item.key)
  useWizardStore.getState().update((form) => forgetUpload(form, item.uploadId))
}

function UploadRow({ item }: { item: UploadItem }) {
  const { pause, resume } = useUploads.getState()
  const picker = useRef<HTMLInputElement>(null)
  const text = statusText(item)

  return (
    <li className="flex h-7 items-center gap-2 px-2.5">
      <StateIcon item={item} />
      <span
        className="w-48 min-w-0 shrink truncate font-mono"
        title={item.name}
      >
        {item.name}
      </span>
      <Progress
        aria-label={`${item.name} progress`}
        value={percent(item)}
        className={cn(
          "w-28 shrink-0",
          item.status === "failed" &&
            "*:data-[slot=progress-indicator]:bg-destructive",
          (item.status === "paused" || item.status === "needs-file") &&
            "*:data-[slot=progress-indicator]:bg-muted-foreground"
        )}
      />
      <span
        className={cn(
          "min-w-0 flex-1 truncate font-mono text-[11px]",
          item.status === "failed"
            ? "text-destructive"
            : "text-muted-foreground"
        )}
        title={text}
      >
        {text}
      </span>
      {item.status === "uploading" && (
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`Pause ${item.name}`}
          onClick={() => pause(item.key)}
        >
          <PauseIcon />
        </Button>
      )}
      {item.status === "paused" && (
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`Resume ${item.name}`}
          onClick={() => resume(item.key)}
        >
          <PlayIcon />
        </Button>
      )}
      {item.status === "failed" && (
        <Button variant="ghost" size="xs" onClick={() => resume(item.key)}>
          <RotateCwIcon /> Retry
        </Button>
      )}
      {item.status === "needs-file" && (
        <>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => picker.current?.click()}
          >
            Choose file
          </Button>
          <input
            ref={picker}
            type="file"
            className="hidden"
            aria-label={`Choose ${item.name} again`}
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ""
              if (!file) return
              if (file.name !== item.name || file.size !== item.size) {
                toast.error(
                  `That is not ${item.name} (${formatBytes(item.size)}).`
                )
                return
              }
              resume(item.key, file)
            }}
          />
        </>
      )}
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Remove ${item.name}`}
        onClick={() => removeUpload(item)}
      >
        <XIcon />
      </Button>
    </li>
  )
}

function LinkRow({ file }: { file: FileRef }) {
  const text = `URL · reachable · ${formatBytes(file.size)} · fetched during the build`
  return (
    <li className="flex h-7 items-center gap-2 px-2.5">
      <LinkIcon
        aria-label="Link"
        className="size-3.5 shrink-0 text-muted-foreground"
      />
      <span
        className="w-48 min-w-0 shrink truncate font-mono"
        title={file.location}
      >
        {file.name}
      </span>
      <span className="w-28 shrink-0" />
      <span
        className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground"
        title={text}
      >
        {text}
      </span>
    </li>
  )
}

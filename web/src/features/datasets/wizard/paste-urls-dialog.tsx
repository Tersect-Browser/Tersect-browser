import { useQuery } from "@tanstack/react-query"
import { CircleCheckIcon, CircleXIcon } from "lucide-react"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

import { checkUrls } from "../api"
import { formatBytes } from "../format"
import type { UrlCheck } from "../types"
import { DOCKED_DIALOG, plural } from "./accessions-shared"

const CHECK_DELAY_MS = 700

function parseLinks(text: string): string[] {
  const lines = text.split(/\s*\n\s*/).map((l) => l.trim())
  return [...new Set(lines.filter((l) => /^(https?|ftp):\/\/\S+$/i.test(l)))]
}

/** 7a: paste links to VCFs; each is checked (headers only) before adding. */
export function PasteUrlsDialog({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdd: (checks: UrlCheck[]) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("sm:max-w-[520px]", DOCKED_DIALOG)}>
        <DialogHeader>
          <DialogTitle>Paste URLs</DialogTitle>
          <DialogDescription>
            HTTPS or FTP links to VCF files. They are fetched during the build.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <PasteUrlsForm
            onCancel={() => onOpenChange(false)}
            onAdd={(checks) => {
              onAdd(checks)
              onOpenChange(false)
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function PasteUrlsForm({
  onCancel,
  onAdd,
}: {
  onCancel: () => void
  onAdd: (checks: UrlCheck[]) => void
}) {
  const [text, setText] = useState("")
  const links = parseLinks(text)
  const key = links.join("\n")
  const [checked, setChecked] = useState("")

  useEffect(() => {
    const timer = setTimeout(() => setChecked(key), CHECK_DELAY_MS)
    return () => clearTimeout(timer)
  }, [key])

  const toCheck = checked ? checked.split("\n") : []
  const checks = useQuery({
    queryKey: ["builder", "check-urls", checked],
    queryFn: ({ signal }) => checkUrls(toCheck, signal),
    enabled: toCheck.length > 0,
    staleTime: 60_000,
    retry: false,
  })
  const results = checks.data ?? []
  const settled = checked === key && !checks.isFetching
  const reachable = settled ? results.filter((r) => r.ok) : []
  const failed = settled ? results.filter((r) => !r.ok) : []

  return (
    <>
      <div className="flex flex-col gap-1">
        <Label htmlFor="paste-urls">Links, one per line</Label>
        <Textarea
          id="paste-urls"
          autoFocus
          spellCheck={false}
          className="max-h-40 min-h-24 font-mono text-t11 md:text-t11"
          placeholder="https://example.org/vcf/LA1777.vcf.gz"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      </div>

      {links.length > 0 && (
        <div className="flex max-h-48 shrink-0 flex-col overflow-y-auto rounded-md border py-1">
          {!settled ? (
            <div className="flex h-6 items-center gap-2 px-2.5 text-muted-foreground">
              <Spinner className="size-3" /> Checking{" "}
              {plural(links.length, "link")}…
            </div>
          ) : checks.isError ? (
            <div className="flex h-6 items-center gap-2 px-2.5 text-destructive">
              Could not check the links: {checks.error.message}
            </div>
          ) : (
            results.map((result) => (
              <CheckRow key={result.url} result={result} />
            ))
          )}
        </div>
      )}

      {failed.length > 0 && (
        <p className="text-t11 text-destructive">
          {failed.length === 1
            ? "1 link was not found and will not be added."
            : `${failed.length} links were not found and will not be added.`}
        </p>
      )}

      <DialogFooter>
        <Button variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        {settled ? (
          <Button
            size="sm"
            disabled={!reachable.length}
            onClick={() => onAdd(reachable)}
          >
            Add {plural(reachable.length, "file")}
          </Button>
        ) : (
          <Button
            size="sm"
            disabled={!links.length}
            onClick={() => setChecked(key)}
          >
            Check links
          </Button>
        )}
      </DialogFooter>
    </>
  )
}

function CheckRow({ result }: { result: UrlCheck }) {
  return (
    <div
      className="flex min-h-6 min-w-0 items-center gap-2 px-2.5 text-t11"
      title={result.url}
    >
      {result.ok ? (
        <CircleCheckIcon
          className="size-3.5 shrink-0 text-primary"
          aria-label="Reachable"
        />
      ) : (
        <CircleXIcon
          className="size-3.5 shrink-0 text-destructive"
          aria-label="Not found"
        />
      )}
      <span
        className={
          result.ok
            ? "min-w-0 flex-1 truncate font-mono"
            : "min-w-0 flex-1 truncate font-mono text-destructive line-through"
        }
      >
        {result.url}
      </span>
      <span
        className={
          result.ok
            ? "shrink-0 font-mono text-muted-foreground"
            : "shrink-0 text-destructive"
        }
      >
        {result.ok
          ? formatBytes(result.size)
          : (result.error ??
            (result.status ? `not found (${result.status})` : "not reachable"))}
      </span>
    </div>
  )
}

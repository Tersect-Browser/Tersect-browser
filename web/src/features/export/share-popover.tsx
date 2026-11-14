import { useMutation } from "@tanstack/react-query"
import { CheckIcon, CopyIcon } from "lucide-react"
import { useState } from "react"
import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Skeleton } from "@/components/ui/skeleton"
import { exportSettings } from "@/lib/api"
import { BASE_URL } from "@/lib/config"
import { usePlotStore } from "@/store/plot-store"

/** Saves the current view on the server and offers a link to it. */
export function SharePopover({ trigger }: { trigger: ReactNode }) {
  const [copied, setCopied] = useState(false)
  const share = useMutation({
    mutationFn: async () => {
      const id = await exportSettings(usePlotStore.getState().getSettings())
      return new URL(`${BASE_URL}share/${id}`, window.location.origin).href
    },
  })

  const copy = async () => {
    if (!share.data) {
      return
    }
    await navigator.clipboard.writeText(share.data)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Popover
      onOpenChange={(open) => {
        if (open) {
          setCopied(false)
          share.mutate()
        } else {
          share.reset()
        }
      }}
    >
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="end" className="flex w-[340px] flex-col gap-1.5">
        <div className="font-medium">Link to current view</div>
        {share.isError ? (
          <p className="text-sm text-destructive">
            The link could not be created.
          </p>
        ) : !share.data ? (
          <Skeleton className="h-(--control) animate-pulse" />
        ) : (
          <div className="flex gap-1.5">
            <Input
              readOnly
              aria-label="Share link"
              className="min-w-0 flex-1 bg-muted font-mono text-[11px]"
              value={share.data}
              onFocus={(event) => event.target.select()}
            />
            <Button variant="outline" onClick={copy}>
              {copied ? <CheckIcon /> : <CopyIcon />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">
          Captures reference, interval, bin size, zoom, selection and groups.
        </p>
      </PopoverContent>
    </Popover>
  )
}

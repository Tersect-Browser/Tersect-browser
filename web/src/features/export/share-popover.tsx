import { useMutation } from "@tanstack/react-query"
import { CheckIcon, CopyIcon, Share2Icon } from "lucide-react"
import { useState } from "react"
import type { ReactNode, RefObject } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Skeleton } from "@/components/ui/skeleton"
import { useIsTouchLayout } from "@/hooks/use-breakpoint"
import { exportSettings } from "@/lib/api"
import { BASE_URL } from "@/lib/config"
import { usePlotStore } from "@/store/plot-store"

const canShareNatively =
  typeof navigator !== "undefined" && typeof navigator.share === "function"

interface SharePopoverProps {
  trigger: ReactNode
  /**
   * The toolbar sheet of the touch layouts. There the panel is not anchored
   * to the button: it opens above the sheet, inset 12px from both edges.
   */
  sheetRef?: RefObject<HTMLElement | null>
}

/** Saves the current view on the server and offers a link to it. */
export function SharePopover({ trigger, sheetRef }: SharePopoverProps) {
  const [copied, setCopied] = useState(false)
  const touch = useIsTouchLayout()
  const aboveSheet = touch && sheetRef !== undefined
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

  const shareNatively = async () => {
    if (!share.data) {
      return
    }
    try {
      await navigator.share({ title: document.title, url: share.data })
    } catch {
      // Dismissed by the user; the link stays available to copy.
    }
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
      {aboveSheet && <PopoverAnchor virtualRef={sheetRef} />}
      <PopoverContent
        align={aboveSheet ? "center" : "end"}
        side={aboveSheet ? "top" : "bottom"}
        sideOffset={aboveSheet ? 8 : 4}
        collisionPadding={12}
        className="flex w-[340px] flex-col gap-1.5 max-lg:w-[calc(100vw-24px)]"
      >
        <div className="font-medium">Link to current view</div>
        {share.isError ? (
          <p className="text-sm text-destructive">
            The link could not be created.
          </p>
        ) : !share.data ? (
          <Skeleton className="h-(--control) animate-pulse" />
        ) : (
          <div className="flex flex-wrap gap-1.5">
            <Input
              readOnly
              aria-label="Share link"
              className="min-w-40 flex-1 bg-muted font-mono text-t11"
              value={share.data}
              onFocus={(event) => event.target.select()}
            />
            <Button variant="outline" onClick={copy}>
              {copied ? <CheckIcon /> : <CopyIcon />}
              {copied ? "Copied" : "Copy"}
            </Button>
            {touch && canShareNatively && (
              <Button variant="outline" onClick={shareNatively}>
                <Share2Icon />
                Share
              </Button>
            )}
          </div>
        )}
        <p className="text-t11 text-muted-foreground">
          Captures reference, interval, bin size, zoom, selection and groups.
        </p>
      </PopoverContent>
    </Popover>
  )
}

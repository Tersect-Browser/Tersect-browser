import { useMutation } from "@tanstack/react-query"
import { CheckIcon, CopyIcon } from "lucide-react"
import { useState } from "react"
import type { ReactNode } from "react"

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
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
      <PopoverContent align="end" className="flex w-96 flex-col gap-2">
        <div className="font-semibold">Link to current view</div>
        {share.isError ? (
          <p className="text-sm text-destructive">
            The link could not be created.
          </p>
        ) : !share.data ? (
          <Skeleton className="h-(--control)" />
        ) : (
          <InputGroup>
            <InputGroupInput
              readOnly
              aria-label="Share link"
              className="font-mono"
              value={share.data}
              onFocus={(event) => event.target.select()}
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton onClick={copy}>
                {copied ? <CheckIcon /> : <CopyIcon />}
                {copied ? "Copied" : "Copy"}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        )}
      </PopoverContent>
    </Popover>
  )
}

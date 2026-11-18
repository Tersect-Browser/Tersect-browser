import * as React from "react"
import { Switch as SwitchPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

/** 26×14 track with a 10px thumb; `--primary` when on. A 44px target on touch. */
export function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer relative inline-flex h-3.5 w-[26px] shrink-0 items-center rounded-full border border-transparent transition-colors outline-none after:absolute after:-inset-x-[9px] after:-inset-y-[15px] after:hidden focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input max-lg:after:block pointer-coarse:after:block",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-2.5 rounded-full bg-background shadow-sm transition-transform data-[state=checked]:translate-x-[13px] data-[state=unchecked]:translate-x-px dark:data-[state=checked]:bg-primary-foreground"
      />
    </SwitchPrimitive.Root>
  )
}

import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

export interface SegmentedOption<T extends string> {
  value: T
  label: ReactNode
  disabled?: boolean
}

/** 24px segmented control (a radio group of buttons). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
  ...aria
}: {
  options: SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  className?: string
  "aria-label"?: string
  "aria-labelledby"?: string
}) {
  return (
    <div
      role="radiogroup"
      {...aria}
      className={cn(
        "inline-flex h-(--control-sm) shrink-0 overflow-hidden rounded-lg border border-input",
        className
      )}
    >
      {options.map((option, index) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex items-center gap-1 px-2.5 text-[11px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-inset disabled:opacity-50 [&_svg]:size-3",
              index > 0 && "border-l border-input",
              active
                ? "bg-accent text-accent-foreground"
                : "bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

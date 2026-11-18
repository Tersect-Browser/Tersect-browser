import { useVirtualizer } from "@tanstack/react-virtual"
import { CheckIcon, ChevronsUpDownIcon, SearchIcon } from "lucide-react"
import { useMemo, useRef, useState } from "react"
import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useMediaQuery } from "@/hooks/use-breakpoint"
import { cn } from "@/lib/utils"

export interface ComboboxOption {
  value: string
  label: string
}

const OPTION_HEIGHT = 24
/** Row height with touch density (matches the CSS density switch). */
const TOUCH_OPTION_HEIGHT = 44
const TOUCH_DENSITY = "(pointer: coarse), (max-width: 1023.98px)"
const MAX_VISIBLE_OPTIONS = 10
const MAX_VISIBLE_TOUCH_OPTIONS = 5

interface ComboboxProps {
  options: ComboboxOption[]
  value: string | undefined
  onChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  /** Short label shown before the value, inside the trigger. */
  prefix?: ReactNode
  className?: string
  /** Extra classes for the option list popover (for example its width). */
  contentClassName?: string
  /** Preferred side of the trigger for the list; it flips when cramped. */
  side?: "top" | "bottom"
  /** Distance kept from the viewport edges, in px. */
  collisionPadding?: number
  "aria-label"?: string
}

function OptionList({
  options,
  value,
  active,
  onActiveChange,
  onSelect,
}: {
  options: ComboboxOption[]
  value: string | undefined
  active: number
  onActiveChange: (index: number) => void
  onSelect: (value: string) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const touch = useMediaQuery(TOUCH_DENSITY)
  const optionHeight = touch ? TOUCH_OPTION_HEIGHT : OPTION_HEIGHT
  const maxVisible = touch ? MAX_VISIBLE_TOUCH_OPTIONS : MAX_VISIBLE_OPTIONS
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: options.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => optionHeight,
    overscan: 8,
  })

  // Keep the keyboard-highlighted option in view.
  const lastActive = useRef(active)
  if (lastActive.current !== active) {
    lastActive.current = active
    virtualizer.scrollToIndex(active)
  }

  if (!options.length) {
    return (
      <div className="px-2 py-4 text-center text-muted-foreground">
        No match found.
      </div>
    )
  }
  return (
    <div
      ref={scrollRef}
      role="listbox"
      className="overflow-y-auto p-1"
      style={{ maxHeight: optionHeight * maxVisible + 8 }}
    >
      <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((item) => {
          const option = options[item.index]
          return (
            <div
              key={option.value}
              role="option"
              aria-selected={option.value === value}
              className={cn(
                "absolute left-0 flex w-full cursor-default items-center gap-2 rounded-md px-2 font-mono",
                item.index === active && "bg-accent text-accent-foreground"
              )}
              style={{ height: item.size, top: item.start }}
              onMouseMove={() => onActiveChange(item.index)}
              onClick={() => onSelect(option.value)}
            >
              <span className="truncate">{option.label}</span>
              {option.value === value && (
                <CheckIcon className="ml-auto size-3 shrink-0" />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Searchable select whose option list is virtualised, for long lists. */
export function Combobox({
  options,
  value,
  onChange,
  placeholder = "Select...",
  searchPlaceholder = "Search...",
  prefix,
  className,
  contentClassName,
  side,
  collisionPadding,
  ...props
}: ComboboxProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [active, setActive] = useState(0)

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return term
      ? options.filter(
          (option) =>
            option.label.toLowerCase().includes(term) ||
            option.value.toLowerCase().includes(term)
        )
      : options
  }, [options, search])

  const select = (next: string) => {
    onChange(next)
    setOpen(false)
  }
  const current = options.find((option) => option.value === value)

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) {
          setSearch("")
          setActive(
            Math.max(
              0,
              options.findIndex((o) => o.value === value)
            )
          )
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={props["aria-label"]}
          className={cn("justify-between gap-1.5 px-2 font-normal", className)}
        >
          {prefix && (
            <span className="shrink-0 text-muted-foreground">{prefix}</span>
          )}
          <span className="min-w-0 flex-1 truncate text-left font-mono">
            {current?.label ?? value ?? placeholder}
          </span>
          <ChevronsUpDownIcon className="size-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side={side}
        collisionPadding={collisionPadding}
        className={cn("w-72 gap-0 p-0", contentClassName)}
      >
        <div className="flex items-center gap-2 border-b px-2">
          <SearchIcon className="size-[13px] shrink-0 text-muted-foreground" />
          <input
            autoFocus
            aria-label={searchPlaceholder}
            placeholder={searchPlaceholder}
            className="h-(--control-lg) w-full bg-transparent outline-none placeholder:text-muted-foreground"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setActive(0)
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault()
                setActive(Math.min(active + 1, filtered.length - 1))
              } else if (event.key === "ArrowUp") {
                event.preventDefault()
                setActive(Math.max(active - 1, 0))
              } else if (event.key === "Enter" && filtered[active]) {
                event.preventDefault()
                select(filtered[active].value)
              }
            }}
          />
        </div>
        <OptionList
          options={filtered}
          value={value}
          active={active}
          onActiveChange={setActive}
          onSelect={select}
        />
      </PopoverContent>
    </Popover>
  )
}

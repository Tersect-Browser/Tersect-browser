import { ChevronsUpDownIcon, PlusIcon } from "lucide-react"
import { useState } from "react"

import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"

import { groupColor, GroupSwatch } from "./accessions-shared"

/** Group cell: pick an existing group or type a new one. */
export function GroupInput({
  value,
  groups,
  onChange,
  label,
}: {
  value: string
  /** All groups in use, in swatch order. */
  groups: string[]
  onChange: (group: string) => void
  label: string
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const typed = search.trim()
  const pick = (group: string) => {
    onChange(group)
    setOpen(false)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) setSearch("")
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-label={label}
          className="flex h-(--c20) w-full min-w-0 items-center gap-1.5 rounded-sm border border-transparent px-1.5 text-left hover:border-input focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none aria-expanded:border-ring max-lg:border-input"
        >
          <GroupSwatch color={groupColor(groups, value)} />
          <span
            className={cn(
              "min-w-0 flex-1 truncate",
              !value && "text-muted-foreground"
            )}
          >
            {value || "No group"}
          </span>
          <ChevronsUpDownIcon className="size-3 shrink-0 opacity-40" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 gap-0 p-0">
        <Command>
          <CommandInput
            placeholder="Find or create a group"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList className="max-h-60">
            <CommandGroup>
              {typed && !groups.includes(typed) && (
                <CommandItem
                  value={`create:${typed}`}
                  onSelect={() => pick(typed)}
                >
                  <PlusIcon className="size-3" />
                  Create <span className="font-medium">{typed}</span>
                </CommandItem>
              )}
              {groups.map((group) => (
                <CommandItem
                  key={group}
                  value={group}
                  data-checked={group === value}
                  onSelect={() => pick(group)}
                >
                  <GroupSwatch color={groupColor(groups, group)} />
                  <span className="truncate">{group}</span>
                </CommandItem>
              ))}
              {value && !typed && (
                <CommandItem value="__none" onSelect={() => pick("")}>
                  <GroupSwatch color={undefined} />
                  <span className="text-muted-foreground">No group</span>
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

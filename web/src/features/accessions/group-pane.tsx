import { Trash2Icon } from "lucide-react"
import { useState } from "react"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ColorPicker, ColorSwatch } from "@/features/accessions/color-picker"
import { uniqueArray } from "@/lib/genome"
import type { AccessionGroup } from "@/lib/types"
import { cn } from "@/lib/utils"

const UNCATEGORIZED = "Uncategorized"

/** Category names in use, sorted, with uncategorized groups last. */
export function extractCategories(
  groups: AccessionGroup[]
): (string | undefined)[] {
  return uniqueArray(groups.map((group) => group.category)).sort((a, b) =>
    a === undefined ? 1 : b === undefined ? -1 : a.localeCompare(b)
  )
}

interface GroupPaneProps {
  groups: AccessionGroup[]
  /** Names of the groups currently filtering the table. */
  selectedGroups: string[]
  onGroupsChange: (groups: AccessionGroup[]) => void
  onSelectedGroupsChange: (names: string[]) => void
}

/** Accession groups by category; selecting groups filters the table. */
export function GroupPane({
  groups,
  selectedGroups,
  onGroupsChange,
  onSelectedGroupsChange,
}: GroupPaneProps) {
  const [colorTarget, setColorTarget] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AccessionGroup | null>(null)
  const categories = extractCategories(groups)

  const toggle = (name: string) =>
    onSelectedGroupsChange(
      selectedGroups.includes(name)
        ? selectedGroups.filter((selected) => selected !== name)
        : [...selectedGroups, name]
    )

  if (!groups.length) {
    return (
      <p className="p-3 text-xs text-muted-foreground">
        No groups yet. Select accessions in the table and save them as a group.
      </p>
    )
  }

  return (
    <>
      <Accordion
        type="multiple"
        // Remount when categories change so new ones start expanded.
        key={categories.join("|")}
        defaultValue={categories.map((category) => category ?? UNCATEGORIZED)}
      >
        {categories.map((category) => (
          <AccordionItem
            key={category ?? UNCATEGORIZED}
            value={category ?? UNCATEGORIZED}
          >
            <AccordionTrigger className="px-3 py-2 text-xs">
              {category ?? UNCATEGORIZED}
            </AccordionTrigger>
            <AccordionContent className="pb-1">
              <ul>
                {groups
                  .filter((group) => group.category === category)
                  .map((group) => {
                    const selected = selectedGroups.includes(group.name)
                    return (
                      <li
                        key={group.name}
                        className={cn(
                          "flex items-center gap-2 px-3 py-1 text-xs",
                          selected
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-accent"
                        )}
                      >
                        <Popover
                          open={colorTarget === group.name}
                          onOpenChange={(open) =>
                            setColorTarget(open ? group.name : null)
                          }
                        >
                          <PopoverTrigger
                            aria-label={`Change color of ${group.name}`}
                          >
                            <ColorSwatch color={group.color} />
                          </PopoverTrigger>
                          <PopoverContent align="start" className="w-60">
                            <ColorPicker
                              color={group.color}
                              onCancel={() => setColorTarget(null)}
                              onConfirm={(color) => {
                                onGroupsChange(
                                  groups.map((other) =>
                                    other === group
                                      ? { ...other, color }
                                      : other
                                  )
                                )
                                setColorTarget(null)
                              }}
                            />
                          </PopoverContent>
                        </Popover>
                        <button
                          type="button"
                          aria-pressed={selected}
                          className="min-w-0 flex-1 truncate text-left"
                          onClick={() => toggle(group.name)}
                        >
                          {group.name}
                        </button>
                        <span className="font-mono font-semibold">
                          {group.accessions.length}
                        </span>
                        <button
                          type="button"
                          aria-label={`Delete group ${group.name}`}
                          className={cn(
                            "hover:opacity-70",
                            !selected && "text-destructive"
                          )}
                          onClick={() => setDeleteTarget(group)}
                        >
                          <Trash2Icon className="size-3.5" />
                        </button>
                      </li>
                    )
                  })}
              </ul>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm group deletion</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the group &lsquo;
              <b>{deleteTarget?.name}</b>&rsquo;? This will not remove any
              accessions.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deleteTarget) {
                  onGroupsChange(groups.filter((g) => g !== deleteTarget))
                  onSelectedGroupsChange(
                    selectedGroups.filter((name) => name !== deleteTarget.name)
                  )
                }
              }}
            >
              <Trash2Icon />
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

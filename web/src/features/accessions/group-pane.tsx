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
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ColorPicker, ColorSwatch } from "@/features/accessions/color-picker"
import { useIsPhone } from "@/hooks/use-breakpoint"
import { uniqueArray } from "@/lib/genome"
import type { AccessionGroup } from "@/lib/types"
import { toast } from "sonner"

import { cn } from "@/lib/utils"

const UNCATEGORIZED = "Uncategorized"
/**
 * Hit area of the swatch and delete buttons: their natural 16px at compact
 * density, 44px at touch density (--c22 is 22px or 44px).
 */
const ICON_TARGET =
  "flex min-h-[calc(16px_+_(var(--c22)_-_22px)_*_1.3)] min-w-[calc(16px_+_(var(--c22)_-_22px)_*_1.3)] shrink-0 items-center justify-center"

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
  const isPhone = useIsPhone()
  const setColor = (group: AccessionGroup, color: string | undefined) => {
    onGroupsChange(
      groups.map((other) => (other === group ? { ...other, color } : other))
    )
    setColorTarget(null)
  }
  const colorGroup = groups.find((group) => group.name === colorTarget)

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
            <AccordionTrigger className="h-(--c24) items-center rounded-none border-t border-sidebar-border px-2 py-0 text-xs font-semibold hover:no-underline">
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
                          "flex h-(--c22) items-center gap-1.5 pr-1.5 pl-2.5 text-xs max-lg:pr-0 max-lg:pl-0",
                          selected
                            ? "bg-sidebar-accent text-sidebar-accent-foreground"
                            : "hover:bg-sidebar-accent"
                        )}
                      >
                        {isPhone ? (
                          // A bottom-docked dialog on phones (below).
                          <button
                            type="button"
                            aria-label={`Change color of ${group.name}`}
                            className={ICON_TARGET}
                            onClick={() => setColorTarget(group.name)}
                          >
                            <ColorSwatch color={group.color} />
                          </button>
                        ) : (
                          <Popover
                            open={colorTarget === group.name}
                            onOpenChange={(open) =>
                              setColorTarget(open ? group.name : null)
                            }
                          >
                            <PopoverTrigger
                              aria-label={`Change color of ${group.name}`}
                              className={ICON_TARGET}
                            >
                              <ColorSwatch color={group.color} />
                            </PopoverTrigger>
                            <PopoverContent align="start" className="w-[232px]">
                              <ColorPicker
                                color={group.color}
                                onCancel={() => setColorTarget(null)}
                                onConfirm={(color) => setColor(group, color)}
                              />
                            </PopoverContent>
                          </Popover>
                        )}
                        <button
                          type="button"
                          aria-pressed={selected}
                          className="h-full min-w-0 flex-1 truncate text-left"
                          onClick={() => toggle(group.name)}
                        >
                          {group.name}
                        </button>
                        <span className="font-mono text-t11 font-medium">
                          {group.accessions.length}
                        </span>
                        <button
                          type="button"
                          aria-label={`Delete group ${group.name}`}
                          className={cn(
                            ICON_TARGET,
                            "group/delete text-destructive"
                          )}
                          onClick={() => setDeleteTarget(group)}
                        >
                          <span className="rounded-[3px] p-0.5 group-hover/delete:bg-destructive/15">
                            <Trash2Icon className="size-3" />
                          </span>
                        </button>
                      </li>
                    )
                  })}
              </ul>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>

      <Dialog
        open={isPhone && colorGroup !== undefined}
        onOpenChange={(open) => !open && setColorTarget(null)}
      >
        <DialogContent showCloseButton={false}>
          <DialogTitle className="sr-only">Select group color</DialogTitle>
          {colorGroup && (
            <ColorPicker
              color={colorGroup.color}
              onCancel={() => setColorTarget(null)}
              onConfirm={(color) => setColor(colorGroup, color)}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent className="data-[size=default]:sm:max-w-[360px]">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete group?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the group &lsquo;
              {deleteTarget?.name}&rsquo;? This will not remove any accessions.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deleteTarget) {
                  toast.success("Group deleted")
                  onGroupsChange(groups.filter((g) => g !== deleteTarget))
                  onSelectedGroupsChange(
                    selectedGroups.filter((name) => name !== deleteTarget.name)
                  )
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

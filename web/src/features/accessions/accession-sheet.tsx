import { useVirtualizer } from "@tanstack/react-virtual"
import { ArrowDownIcon, ArrowUpIcon, PlusIcon } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import type { RefObject } from "react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { AddGroupDialog } from "@/features/accessions/add-group-dialog"
import { extractCategories, GroupPane } from "@/features/accessions/group-pane"
import { TgrcImporter } from "@/features/accessions/tgrc-importer"
import { arraySubtract, arrayUnion, uniqueArray } from "@/lib/genome"
import type { AccessionGroup, AccessionInfo } from "@/lib/types"
import { cn } from "@/lib/utils"
import { usePlotStore } from "@/store/plot-store"
import { useUiStore } from "@/store/ui-store"

const ROW_HEIGHT = 22
const MAX_COLUMN_WIDTH = 200
const SORT_ICON_WIDTH = 30
const CHECKBOX_COLUMN_WIDTH = 36
/** Cap on suggestions per column filter, to keep the DOM small. */
const MAX_SUGGESTIONS = 200
/** Pseudo-column: sort selected accessions first. */
const SELECTED_FIELD = "__selected"

interface TableColumn {
  field: string
  width: number
}

interface SortState {
  field: string
  descending: boolean
  /** Selection when the sort was applied, so rows do not jump while ticking. */
  selectedSnapshot: Set<string>
}

/** One column per info field, sized to fit its content. */
function extractColumns(infos: AccessionInfo[]): TableColumn[] {
  if (!infos.length) {
    return []
  }
  const ctx = document.createElement("canvas").getContext("2d")
  if (ctx) {
    // Matches the text-xs cells of the table.
    ctx.font = `12px ${getComputedStyle(document.body).fontFamily}`
  }
  const measure = (text: string) => ctx?.measureText(text ?? "").width ?? 80
  return Object.keys(infos[0])
    .filter((field) => field !== "id")
    .map((field) => ({
      field,
      width: Math.ceil(
        Math.min(
          Math.max(
            measure(field) + SORT_ICON_WIDTH,
            ...infos.map((info) => measure(info[field]) + 20)
          ),
          MAX_COLUMN_WIDTH
        )
      ),
    }))
}

interface AccessionDraft {
  selected: string[]
  groups: AccessionGroup[]
  infos: AccessionInfo[]
}

interface AccessionSelectorProps {
  /** Kept up to date with the draft, for the drawer to apply on close. */
  draftRef: RefObject<AccessionDraft | null>
}

/**
 * Contents of the accession drawer. Holds a draft of the selection, the
 * groups and the accession infos, which is applied when the drawer closes.
 */
function AccessionSelector({ draftRef }: AccessionSelectorProps) {
  const store = usePlotStore.getState()
  const plugins = store.plugins

  const [infos, setInfos] = useState(store.accessionInfos ?? [])
  const [groups, setGroups] = useState(store.accessionGroups)
  const [selected, setSelected] = useState(store.accessions ?? [])
  const [selectedGroups, setSelectedGroups] = useState<string[]>([])
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [sort, setSort] = useState<SortState | null>(null)
  const [addGroupOpen, setAddGroupOpen] = useState(false)

  useEffect(() => {
    draftRef.current = { selected, groups, infos }
  }, [draftRef, selected, groups, infos])

  const columns = useMemo(() => extractColumns(infos), [infos])
  const selectedSet = useMemo(() => new Set(selected), [selected])

  /** Accessions passing the group selection and the column filters. */
  const filtered = useMemo(() => {
    let rows = infos
    if (selectedGroups.length) {
      const byId = new Map(infos.map((info) => [info.id, info]))
      const ids = groups
        .filter((group) => selectedGroups.includes(group.name))
        .reduce<string[]>((acc, g) => arrayUnion(acc, g.accessions), [])
      rows = ids.flatMap((id) => byId.get(id) ?? [])
    }
    for (const [field, value] of Object.entries(filters)) {
      const contains = value.toUpperCase()
      if (contains) {
        rows = rows.filter((info) =>
          (info[field] ?? "").toUpperCase().includes(contains)
        )
      }
    }
    return rows
  }, [infos, groups, selectedGroups, filters])

  const rows = useMemo(() => {
    if (!sort) {
      return filtered
    }
    const sorted =
      sort.field === SELECTED_FIELD
        ? [
            ...filtered.filter((info) => sort.selectedSnapshot.has(info.id)),
            ...filtered.filter((info) => !sort.selectedSnapshot.has(info.id)),
          ]
        : [...filtered].sort((a, b) =>
            (a[sort.field] ?? "").localeCompare(b[sort.field] ?? "")
          )
    return sort.descending ? sorted.reverse() : sorted
  }, [filtered, sort])

  const suggestions = useMemo(() => {
    const output: Record<string, string[]> = {}
    for (const { field } of columns) {
      output[field] = uniqueArray(filtered.map((info) => info[field] ?? ""))
        .filter(Boolean)
        .sort()
        .slice(0, MAX_SUGGESTIONS)
    }
    return output
  }, [columns, filtered])

  const filtersUsed = filtered.length !== infos.length
  const allSelected =
    filtered.length > 0 && filtered.every((info) => selectedSet.has(info.id))

  const toggleSort = (field: string) =>
    setSort((current) => ({
      field,
      descending: current?.field === field ? !current.descending : false,
      selectedSnapshot: selectedSet,
    }))

  const toggleAccession = (id: string) =>
    setSelected((current) =>
      current.includes(id)
        ? current.filter((other) => other !== id)
        : [...current, id]
    )

  const toggleAll = (checked: boolean) => {
    const ids = filtered.map((info) => info.id)
    setSelected((current) =>
      checked ? arrayUnion(current, ids) : arraySubtract(current, ids)
    )
  }

  const scrollRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 20,
  })

  const tableWidth =
    CHECKBOX_COLUMN_WIDTH + columns.reduce((sum, col) => sum + col.width, 0)
  const sortIcon = (field: string) =>
    sort?.field === field &&
    (sort.descending ? (
      <ArrowDownIcon className="size-3 shrink-0" />
    ) : (
      <ArrowUpIcon className="size-3 shrink-0" />
    ))

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="w-56 shrink-0 overflow-y-auto border-r">
        <GroupPane
          groups={groups}
          selectedGroups={selectedGroups}
          onGroupsChange={setGroups}
          onSelectedGroupsChange={setSelectedGroups}
        />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex gap-1 border-b p-2">
          <Button
            variant="outline"
            size="sm"
            disabled={selected.length === 0}
            onClick={() => setSelected([])}
          >
            Clear selection
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!filtersUsed && !sort}
            onClick={() => {
              setFilters({})
              setSelectedGroups([])
              setSort(null)
            }}
          >
            Clear filters
          </Button>
        </div>

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto text-xs">
          <div style={{ width: tableWidth }} role="table">
            <div
              className="sticky top-0 z-10 border-b bg-muted"
              role="rowgroup"
            >
              <div className="flex font-medium" role="row">
                <button
                  type="button"
                  aria-label="Sort by selection"
                  className="flex shrink-0 items-center justify-center py-1"
                  style={{ width: CHECKBOX_COLUMN_WIDTH }}
                  onClick={() => toggleSort(SELECTED_FIELD)}
                >
                  {sortIcon(SELECTED_FIELD) || (
                    <ArrowUpIcon className="size-3 opacity-30" />
                  )}
                </button>
                {columns.map((column) => (
                  <button
                    key={column.field}
                    type="button"
                    role="columnheader"
                    className="flex shrink-0 items-center gap-1 px-2 py-1 text-left hover:bg-accent"
                    style={{ width: column.width }}
                    onClick={() => toggleSort(column.field)}
                  >
                    <span className="truncate">{column.field}</span>
                    {sortIcon(column.field)}
                  </button>
                ))}
              </div>
              <div className="flex items-center pb-1" role="row">
                <div
                  className="flex shrink-0 justify-center"
                  style={{ width: CHECKBOX_COLUMN_WIDTH }}
                >
                  <Checkbox
                    aria-label="Select all matching accessions"
                    checked={allSelected}
                    onCheckedChange={(checked) => toggleAll(checked === true)}
                  />
                </div>
                {columns.map((column) => (
                  <div
                    key={column.field}
                    className="shrink-0 px-1"
                    style={{ width: column.width }}
                  >
                    <input
                      aria-label={`Filter ${column.field}`}
                      list={`filter-${column.field}`}
                      className="h-6 w-full rounded-sm border bg-background px-1.5 outline-none focus-visible:border-ring"
                      value={filters[column.field] ?? ""}
                      onChange={(event) =>
                        setFilters((current) => ({
                          ...current,
                          [column.field]: event.target.value,
                        }))
                      }
                    />
                    <datalist id={`filter-${column.field}`}>
                      {suggestions[column.field]?.map((option) => (
                        <option key={option} value={option} />
                      ))}
                    </datalist>
                  </div>
                ))}
              </div>
            </div>

            <div
              className="relative"
              role="rowgroup"
              style={{ height: virtualizer.getTotalSize() }}
            >
              {virtualizer.getVirtualItems().map((item) => {
                const info = rows[item.index]
                const isSelected = selectedSet.has(info.id)
                return (
                  <div
                    key={info.id}
                    role="row"
                    aria-selected={isSelected}
                    className={cn(
                      "absolute left-0 flex w-full cursor-pointer items-center border-b border-border/50",
                      isSelected ? "bg-primary/10" : "hover:bg-accent"
                    )}
                    style={{ height: item.size, top: item.start }}
                    onClick={() => toggleAccession(info.id)}
                  >
                    <div
                      className="flex shrink-0 justify-center"
                      style={{ width: CHECKBOX_COLUMN_WIDTH }}
                    >
                      <Checkbox
                        aria-label={`Select ${info.Label}`}
                        checked={isSelected}
                        tabIndex={-1}
                        className="pointer-events-none"
                      />
                    </div>
                    {columns.map((column) => (
                      <div
                        key={column.field}
                        role="cell"
                        className="shrink-0 truncate px-2"
                        style={{ width: column.width }}
                      >
                        {info[column.field]}
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 border-t p-2">
          <div className="min-w-40">
            {plugins.includes("tgrc-importer") && (
              <TgrcImporter infos={infos} onInfosChange={setInfos} />
            )}
          </div>
          <div className="text-center text-xs text-muted-foreground">
            <div>
              {filtered.length} {filtersUsed && "matching "}accessions
            </div>
            <div>({selected.length} selected)</div>
          </div>
          <Button
            size="sm"
            disabled={selected.length === 0}
            onClick={() => setAddGroupOpen(true)}
          >
            <PlusIcon />
            Save as a group...
          </Button>
        </div>
      </div>

      {addGroupOpen && (
        <AddGroupDialog
          selectedAccessions={selected}
          groups={groups}
          categories={extractCategories(groups).filter(
            (category): category is string => category !== undefined
          )}
          onSave={(group) => setGroups((current) => [...current, group])}
          onClose={() => setAddGroupOpen(false)}
        />
      )}
    </div>
  )
}

/** Drawer for choosing which accessions are plotted and grouping them. */
export function AccessionSheet() {
  const open = useUiStore((state) => state.accessionSheetOpen)
  const setOpen = useUiStore((state) => state.setAccessionSheetOpen)
  const applyAccessions = usePlotStore((state) => state.applyAccessions)
  const draftRef = useRef<AccessionDraft | null>(null)

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        const draft = draftRef.current
        if (!next && draft) {
          applyAccessions(draft.selected, draft.groups, draft.infos)
          draftRef.current = null
        }
        setOpen(next)
      }}
    >
      <SheetContent
        side="left"
        className="gap-0 data-[side=left]:w-[90vw] data-[side=left]:sm:max-w-none"
      >
        <SheetHeader className="border-b">
          <SheetTitle>Accession selection</SheetTitle>
          <SheetDescription>
            Choose the accessions shown on the plot. Changes apply when this
            panel closes.
          </SheetDescription>
        </SheetHeader>
        <AccessionSelector draftRef={draftRef} />
      </SheetContent>
    </Sheet>
  )
}

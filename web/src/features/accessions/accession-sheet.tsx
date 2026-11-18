import { useVirtualizer } from "@tanstack/react-virtual"
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronsUpDownIcon,
  DatabaseIcon,
  FilterXIcon,
  FolderPlusIcon,
  SquareXIcon,
  XIcon,
} from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import type { RefObject } from "react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet"
import { AddGroupDialog } from "@/features/accessions/add-group-dialog"
import { extractCategories, GroupPane } from "@/features/accessions/group-pane"
import { TgrcImporter } from "@/features/accessions/tgrc-importer"
import { useIsPhone, useMediaQuery } from "@/hooks/use-breakpoint"
import { arraySubtract, arrayUnion, uniqueArray } from "@/lib/genome"
import type { AccessionGroup, AccessionInfo } from "@/lib/types"
import { cn } from "@/lib/utils"
import { usePlotStore } from "@/store/plot-store"
import { useUiStore } from "@/store/ui-store"

/** Same condition as the touch density block in index.css. */
const TOUCH_DENSITY = "(pointer: coarse), (max-width: 1023.98px)"
/** Row height, cell font size and checkbox column width: compact and touch. */
const COMPACT = { rowHeight: 20, fontSize: 11, checkboxWidth: 26 }
const TOUCH = { rowHeight: 44, fontSize: 13, checkboxWidth: 44 }
const MAX_COLUMN_WIDTH = 260
/** Cap on the pinned label column on phones, so other columns stay in view. */
const MAX_PINNED_WIDTH_PHONE = 150
const SORT_ICON_WIDTH = 30

/** Identifier-like columns are mono; species names are italic. */
function columnStyle(field: string) {
  if (/species/i.test(field)) {
    return "italic"
  }
  if (/^(label|tgrc|collection|accession|id)\b|tgrc|collection/i.test(field)) {
    return "font-mono"
  }
  return ""
}
/**
 * Opaque backgrounds for the pinned cells of a row, matching the row's own
 * (translucent) selected and hover colours.
 */
function pinnedBackground(selected: boolean) {
  return selected
    ? "bg-[color-mix(in_oklch,var(--accent)_55%,var(--card))] group-hover/row:bg-accent"
    : "bg-card group-hover/row:bg-accent"
}
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
function extractColumns(
  infos: AccessionInfo[],
  fontSize: number
): TableColumn[] {
  if (!infos.length) {
    return []
  }
  const ctx = document.createElement("canvas").getContext("2d")
  if (ctx) {
    // Matches the text-t11 cells of the table.
    ctx.font = `${fontSize}px ${getComputedStyle(document.body).fontFamily}`
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
  /** Phones show one pane at a time. */
  const [accTab, setAccTab] = useState<"table" | "groups">("table")
  const isPhone = useIsPhone()
  const touch = useMediaQuery(TOUCH_DENSITY)
  const density = touch ? TOUCH : COMPACT
  const checkboxWidth = density.checkboxWidth

  useEffect(() => {
    draftRef.current = { selected, groups, infos }
  }, [draftRef, selected, groups, infos])

  const columns = useMemo(
    () => extractColumns(infos, density.fontSize),
    [infos, density.fontSize]
  )
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
  const matchingSelected = filtered.filter((info) =>
    selectedSet.has(info.id)
  ).length
  const allSelected =
    filtered.length > 0 && matchingSelected === filtered.length

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
    estimateSize: () => density.rowHeight,
    overscan: 20,
  })
  useEffect(() => {
    virtualizer.measure()
  }, [virtualizer, density.rowHeight])

  const tableWidth =
    checkboxWidth + columns.reduce((sum, col) => sum + col.width, 0)
  const sortIcon = (field: string) =>
    sort?.field === field ? (
      sort.descending ? (
        <ArrowDownIcon className="size-[11px] shrink-0 text-primary" />
      ) : (
        <ArrowUpIcon className="size-[11px] shrink-0 text-primary" />
      )
    ) : (
      <ChevronsUpDownIcon className="size-2.5 shrink-0 text-muted-foreground" />
    )
  // Columns share the free width in proportion to their natural width.
  const columnFlex = (column: TableColumn) => ({
    flex: `${column.width} 0 ${column.width}px`,
    minWidth: column.width,
  })
  // On touch layouts the table scrolls sideways under the checkbox and the
  // first (label) column, which stay pinned.
  const pinnedWidth = (column: TableColumn) =>
    isPhone ? Math.min(column.width, MAX_PINNED_WIDTH_PHONE) : column.width
  const cellStyle = (column: TableColumn, index: number) =>
    touch && index === 0
      ? {
          flex: `0 0 ${pinnedWidth(column)}px`,
          minWidth: 0,
          left: checkboxWidth,
        }
      : columnFlex(column)
  const pinned = touch ? "sticky left-0 z-[1]" : ""
  const pinnedCell = (index: number) =>
    touch && index === 0 ? "sticky z-[1]" : ""

  return (
    <div className="flex min-h-0 flex-1 max-sm:flex-col">
      <div
        role="tablist"
        className="grid shrink-0 grid-cols-2 border-b sm:hidden"
      >
        {(
          [
            ["table", "Accessions"],
            ["groups", "Groups"],
          ] as const
        ).map(([tab, label]) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={accTab === tab}
            className={cn(
              "h-11 border-b-2 font-medium whitespace-nowrap",
              accTab === tab ? "border-primary" : "border-transparent"
            )}
            onClick={() => setAccTab(tab)}
          >
            {label}
          </button>
        ))}
      </div>
      <aside
        className={cn(
          "w-[250px] shrink-0 overflow-y-auto border-r bg-sidebar max-sm:min-h-0 max-sm:w-full max-sm:flex-1 max-sm:border-r-0",
          accTab !== "groups" && "max-sm:hidden"
        )}
      >
        <div className="caption px-2.5 pt-2 pb-1">Groups</div>
        <GroupPane
          groups={groups}
          selectedGroups={selectedGroups}
          onGroupsChange={setGroups}
          onSelectedGroupsChange={setSelectedGroups}
        />
      </aside>

      <div
        className={cn(
          "flex min-h-0 min-w-0 flex-1 flex-col",
          accTab === "groups" && "max-sm:hidden"
        )}
      >
        <div className="flex gap-[5px] border-b px-2 py-[5px]">
          <Button
            variant="outline"
            size="sm"
            disabled={selected.length === 0}
            onClick={() => setSelected([])}
          >
            <SquareXIcon />
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
            <FilterXIcon />
            Clear filters
          </Button>
        </div>

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto text-t11">
          <div style={{ minWidth: tableWidth }} role="table">
            <div
              className="sticky top-0 z-10 border-b bg-muted"
              role="rowgroup"
            >
              <div
                className="flex h-(--c22) font-semibold whitespace-nowrap"
                role="row"
              >
                <button
                  type="button"
                  aria-label="Sort by selection"
                  className={cn(
                    "flex shrink-0 items-center justify-center bg-muted",
                    pinned
                  )}
                  style={{ width: checkboxWidth }}
                  onClick={() => toggleSort(SELECTED_FIELD)}
                >
                  {sortIcon(SELECTED_FIELD)}
                </button>
                {columns.map((column, index) => (
                  <button
                    key={column.field}
                    type="button"
                    role="columnheader"
                    className={cn(
                      "flex items-center gap-[3px] bg-muted px-1.5 text-left hover:bg-accent",
                      pinnedCell(index)
                    )}
                    style={cellStyle(column, index)}
                    onClick={() => toggleSort(column.field)}
                  >
                    <span className="truncate">{column.field}</span>
                    {sortIcon(column.field)}
                  </button>
                ))}
              </div>
              <div className="flex h-(--c24) items-center border-t" role="row">
                <div
                  className={cn(
                    "flex h-full shrink-0 items-center justify-center bg-muted",
                    pinned
                  )}
                  style={{ width: checkboxWidth }}
                >
                  <Checkbox
                    aria-label="Select all matching accessions"
                    checked={
                      allSelected
                        ? true
                        : matchingSelected > 0
                          ? "indeterminate"
                          : false
                    }
                    onCheckedChange={(checked) => toggleAll(checked === true)}
                  />
                </div>
                {columns.map((column, index) => (
                  <div
                    key={column.field}
                    className={cn(
                      "flex h-full items-center bg-muted px-[3px]",
                      pinnedCell(index)
                    )}
                    style={cellStyle(column, index)}
                  >
                    <input
                      aria-label={`Filter ${column.field}`}
                      list={`filter-${column.field}`}
                      placeholder="Filter…"
                      className="h-(--c18) w-full min-w-0 rounded-[3px] border border-input bg-background px-1 font-normal outline-none placeholder:text-muted-foreground focus-visible:border-ring"
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
                      "group/row absolute left-0 flex w-full cursor-pointer items-center border-b border-border/60",
                      isSelected
                        ? "bg-[color-mix(in_oklch,var(--accent)_55%,transparent)] hover:bg-accent"
                        : "hover:bg-accent"
                    )}
                    style={{ height: item.size, top: item.start }}
                    onClick={() => toggleAccession(info.id)}
                  >
                    <div
                      className={cn(
                        "flex shrink-0 justify-center",
                        touch && "h-full items-center",
                        touch && pinnedBackground(isSelected),
                        pinned
                      )}
                      style={{ width: checkboxWidth }}
                    >
                      <Checkbox
                        aria-label={`Select ${info.Label}`}
                        checked={isSelected}
                        tabIndex={-1}
                        className="pointer-events-none"
                      />
                    </div>
                    {columns.map((column, index) => (
                      <div
                        key={column.field}
                        role="cell"
                        className={cn(
                          "truncate px-1.5",
                          columnStyle(column.field),
                          touch &&
                            index === 0 &&
                            cn(
                              "h-full leading-(--row)",
                              pinnedBackground(isSelected)
                            ),
                          pinnedCell(index)
                        )}
                        style={cellStyle(column, index)}
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

        <div className="flex min-h-9 flex-wrap items-center gap-x-2.5 gap-y-1 border-t px-2 py-[5px]">
          <div className="min-w-40 max-lg:min-w-0">
            {plugins.includes("tgrc-importer") && (
              <TgrcImporter infos={infos} onInfosChange={setInfos} />
            )}
          </div>
          <span className="flex-1 truncate text-center max-lg:order-first max-lg:basis-full">
            <b className="font-mono font-medium">{filtered.length}</b> matching
            accessions (
            <b className="font-mono font-medium">{selected.length}</b> selected)
          </span>
          <Button
            variant="outline"
            size="sm"
            className="max-lg:ml-auto"
            disabled={selected.length === 0}
            onClick={() => setAddGroupOpen(true)}
          >
            <FolderPlusIcon />
            Save as a group…
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
        showCloseButton={false}
        // Under the top bar, which stays usable and unscrimmed. Full screen
        // on phones.
        overlayClassName="top-[calc(var(--topbar)+env(safe-area-inset-top))]"
        className="gap-0 bg-card pb-[env(safe-area-inset-bottom)] text-xs shadow-[8px_0_32px_rgb(0_0_0/0.25)] data-[side=left]:top-[calc(var(--topbar)+env(safe-area-inset-top))] data-[side=left]:h-[calc(100%-var(--topbar)-env(safe-area-inset-top))] data-[side=left]:w-[90vw] data-[side=left]:max-sm:w-full data-[side=left]:max-sm:border-r-0 data-[side=left]:sm:max-w-none"
      >
        <div className="flex min-h-[34px] shrink-0 items-center gap-2 border-b pr-1.5 pl-3">
          <DatabaseIcon className="size-[13px] text-muted-foreground" />
          <SheetTitle className="text-t13 font-semibold whitespace-nowrap">
            Accession selection
          </SheetTitle>
          <SheetDescription className="truncate text-xs text-muted-foreground max-sm:hidden">
            Changes apply when the drawer closes.
          </SheetDescription>
          <div className="flex-1" />
          <SheetClose asChild>
            <Button size="sm">Apply and close</Button>
          </SheetClose>
          <SheetClose asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Close">
              <XIcon />
            </Button>
          </SheetClose>
        </div>
        <AccessionSelector draftRef={draftRef} />
      </SheetContent>
    </Sheet>
  )
}

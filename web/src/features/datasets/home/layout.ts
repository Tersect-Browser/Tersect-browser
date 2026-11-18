/**
 * Columns of the Home dataset list: Dataset, Reference, Accessions, Status,
 * menu. On phones the row is two columns, the dataset and one actions button:
 * reference and count fold into a line under the name (PHONE_META) and the
 * status drops to a second row.
 */
export const GRID =
  "grid grid-cols-[minmax(0,1fr)_var(--c28)] items-center gap-x-3 gap-y-1.5 px-4 sm:grid-cols-[minmax(0,1fr)_8rem_5.5rem_7rem_max(1.5rem,var(--control-xs))] sm:gap-4"

/** One dataset or draft row. */
export const ROW = `${GRID} border-b py-2.5 last:border-b-0`

/** Reference and Accessions cells: columns from the tablet up. */
export const WIDE_CELL = "max-sm:hidden"

/** "SL2.50 · 84 accessions" under the name, on phones only. */
export const PHONE_META =
  "block truncate font-mono text-t11 text-muted-foreground sm:hidden"

/** Description: one truncated line in the table, wrapping on phones. */
export const DESCRIPTION =
  "block truncate text-muted-foreground max-sm:text-pretty max-sm:whitespace-normal"

export const STATUS_CELL =
  "flex min-w-0 items-center max-sm:col-start-1 max-sm:row-start-2"

/** The actions button spans both phone rows. */
export const MENU_CELL =
  "relative z-10 max-sm:col-start-2 max-sm:row-span-2 max-sm:row-start-1 max-sm:self-start"

/**
 * Grows a small link's hit area to 44px on touch without changing its size.
 * The link must be positioned.
 */
export const TOUCH_TARGET =
  "max-lg:before:absolute max-lg:before:-inset-3 pointer-coarse:before:absolute pointer-coarse:before:-inset-3"

/** The folded reference and count line. */
export function phoneMeta(
  reference: string | null | undefined,
  accessions: string | null | undefined
): string {
  return [reference, accessions && `${accessions} accessions`]
    .filter(Boolean)
    .join(" · ")
}

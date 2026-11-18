# Handoff: Tersect Browser — phone and tablet

## Overview

Adapts every existing Tersect screen (Home, Browser, all dialogs, the introgression panel, and the dataset-upload flow) to phones and tablets. Nothing is removed on small screens; layout and input method change. This spec is an addendum to `HANDOFF.md` (design system and desktop screens) and `HANDOFF-dataset-upload.md` (upload flow). Read those first. Where they disagree with this file on a touch viewport, this file wins.

## About the design files

The `.dc.html` files in this folder are design references built in HTML. They show the intended look and behaviour; they are not production code. Recreate them in the React / shadcn / Tailwind v4 app using its existing components. Do not port the prototypes' logic classes: their data is invented and their canvases are mocks.

## Fidelity

High fidelity. Colours, type, sizes and spacing are final and come from `tersect-theme.css`. Inline styles in the prototypes hold exact values.

## Files

| File | Use |
|---|---|
| `Tersect Mobile Screens.dc.html` | Artboards. Twelve sections (M1–M12), four screens each, on a 390 × 844 phone and a 768 × 1024 tablet, light and dark. One section mounts at a time; use the buttons at the top. Ids below (for example M8b) refer to these. Tablet ids add `-t`, dark ids add `-d`. |
| `TersectBrowser.dc.html` | Browser prototype. Resize the window below 1024px or 640px to see the touch layouts. The `sheet` tweak opens a toolbar sheet. |
| `TersectDatasets.dc.html` | Home, Builds and upload wizard prototype. Same breakpoints. |
| `tersect-theme.css` | Tokens, including the `touch` density block. |
| `HANDOFF.md`, `HANDOFF-dataset-upload.md` | Desktop specs this file extends. |

---

## 1. Foundations

### 1.1 Breakpoints

| Name | Width | Meaning |
|---|---|---|
| Phone | < 640px | Single column, bottom sheets, full-screen panels |
| Tablet | 640–1023px | Touch density, overlay panels, desktop-like tables where they fit |
| Desktop | ≥ 1024px | Unchanged from `HANDOFF.md` |

The prototypes switch on container width so the artboards work. In the app:

- **Layout** switches on width: Tailwind `sm` = 640px, `lg` = 1024px. Write phone-first classes.
- **Density** switches on input: apply the touch scale under `@media (pointer: coarse)`, and also below 1024px. A touch laptop at 1440px gets large controls with the desktop layout.

### 1.2 Touch density

`tersect-theme.css` defines both scales. The component code keeps using the same variables; only their values change.

| Token | Compact | Touch |
|---|---|---|
| `--c18` | 18px | 40px |
| `--c20`, `--c22`, `--c24`, `--c26`, `--c28` | 20–28px | 44px |
| `--c30` | 30px | 48px |
| `--row` (table row) | 20px | 44px |
| `--cb` (checkbox, radio) | 12px | 20px |
| `--t9` | 9.5px | 11px |
| `--t10` | 10px | 12px |
| `--t11` | 11px | 13px |
| `--t12` (base) | 12px | 15px |
| `--t13` | 13px | 16px |
| `--t14` (titles) | 14px | 17px |
| `--pad-x` (added to button side padding) | 0 | 6px |

Rules that follow from this:

- Every tappable target is at least 44 × 44px.
- Button side padding is `calc(base + var(--pad-x))`, so an 8px button becomes 14px on touch.
- Button, segmented-control, tab and top-bar labels never wrap (`white-space: nowrap`). Truncate with an ellipsis where a label is data.
- Inputs use 16px text on phones so iOS does not zoom on focus.
- Top bar height: 48px (40px on desktop). The breadcrumb is hidden on phones.
- Respect safe areas: add `env(safe-area-inset-bottom)` to the tab bar, sheets and docked dialogs, and `env(safe-area-inset-top)` to the top bar.

### 1.3 Shared patterns

- **Bottom sheet**: `--card` surface, 1px top border, radius 14px 14px 0 0, shadow `0 -8px 32px` black at 22–25%, padding 14px 16px 18px, scrim black at 30%. Tapping the scrim closes it. Use shadcn `Drawer` (vaul) for swipe-to-dismiss.
- **Dialogs on phones**: docked to the bottom edge, full width minus 8px side and bottom margins, same radius and shadow as desktop, max height 90% with the body scrolling and the footer fixed. On tablets dialogs stay centred at their desktop widths.
- **Popovers on touch**: open upward from their trigger (`bottom: calc(100% + 4px)`) when the trigger sits in a bottom sheet. Select and combobox lists take the full width of the sheet.
- **Context menu on touch**: an action sheet pinned 8px from the left, right and bottom edges, opened by long-press. Same header and items as desktop.
- **Hover**: there is none. Tooltips that carry information appear on tap and dismiss on the next tap or pan. Icon-only buttons keep an `aria-label`.

---

## 2. Home and Builds (M1)

Phone:

- The dataset list drops its header row. Each row is a two-column grid, `minmax(0,1fr)` and one 44px actions button. Left column: name (600) and description on the first line, status badge on a second row. Reference assembly and accession count fold into one mono line under the name.
- The actions button spans both rows and opens the same dropdown, positioned 46px below the row top.
- "Builds" and "New dataset" stay in the list header, at 44px.
- Builds table becomes cards with areas `"name view" / "status status" / "started duration"`, 10px vertical padding, no header row. "Started by" is hidden.

Tablet: the desktop dataset row is kept. Builds uses five columns (name, status, started, duration, view); "Started by" is hidden.

Empty state (M1c) is unchanged apart from density.

---

## 3. Browser (M7–M9)

### 3.1 Shell

Top to bottom on touch: top bar (48px), optional variant banner, optional gene track strip, plot (fills remaining height), status bar, **bottom tab bar** (56px). The desktop toolbar is not shown as a bar.

### 3.2 Bottom tab bar and toolbar sheets (M8)

- Tab bar: 56px, `--card`, 1px top border, four equal columns. Each tab is a 20px icon over a 13px / 500 label. The active tab is `--primary`; others `--foreground`. Hidden while the accession selection is open.

| Tab | lucide icon | Sheet contents |
|---|---|---|
| Show | `eye` | Display style (segmented, three options), Accessions button (opens accession selection), Reference combobox at full width |
| Where | `map-pin` | Chromosome select, interval control, bin size slider, zoom − / value / + |
| Analysis | `flask-conical` | Variant search with its clear button, Introgression analysis, Genome track toggle |
| Output | `share-2` | Export plot image, Share |

- Tapping a tab opens its sheet directly above the tab bar; tapping it again, or the scrim, closes it. Only one sheet is open at a time.
- Inside a sheet, controls wrap in rows with an 8px gap, each group stacked with a 10px gap. Buttons always show their text labels.
- **Interval control**: on phones the range slider goes on its own row first, then the two coordinate inputs side by side at `calc(50% - 3px)`. On tablets the inputs are 116px each with the slider between them.
- **Share** on touch is not anchored to the button: it is a panel inset 12px from the left and right edges, opening above the sheet. Add the native share action (`navigator.share`) beside Copy when available.
- Changing a control in a sheet reloads the plot with the same 700ms debounce; the sheet stays open.

### 3.3 Plot gestures

| Gesture | Result |
|---|---|
| One-finger drag | Pan |
| Pinch | Zoom, 100% to 1000%, centred on the pinch |
| Tap on a label, cell or ruler position | Plot tooltip at that point (same content as desktop hover) |
| Long-press (about 500ms) on a label, cell or ruler position | Context menu as an action sheet |
| Long-press then drag along the ruler | Range selection; releasing opens the range menu |

Set `touch-action: none` on the canvases and handle Pointer Events. The − / + buttons in the Where sheet remain as a non-gesture alternative.

- The corner cell shows the display-style name only on phones; the accession count is hidden there and stays in the status bar.
- Loading, error and empty overlays are unchanged. The empty state's "Select accessions" button is 44px.
- The status bar keeps the legend. If it does not fit on one line at 390px, drop the interval text first, then the accession × bin count.

### 3.4 Gene track strip (M9d)

Same strip as desktop, still locked to the heatmap's horizontal scale and scroll. It is toggled from the Analysis sheet.

---

## 4. Accession selection (M10)

- Always a drawer on touch (the docked-panel variant is desktop only). Changes apply when it closes.
- **Phone**: full screen under the top bar. A two-tab switch, **Accessions** and **Groups**, sits under the header; the active tab has a 2px `--primary` underline. Only one pane shows at a time, each at full width. The header's hint text is hidden.
- **Tablet**: 90% width drawer with both panes side by side; groups pane 250px.
- Table rows are 44px. The header row uses the 44px control height and its titles do not wrap. The table scrolls horizontally when metadata columns exceed the width; the checkbox and label columns stay pinned.
- Footer wraps: the "n matching accessions (m selected)" count takes its own full-width line first, then "Import TGRC gene…" on the left and "Save as a group…" on the right.
- Add group (M10c) and delete confirmation: bottom-docked dialogs on phones.
- Colour picker (M10d): a bottom-docked dialog on phones rather than a popover. Preset swatches are at least 32px with 8px gaps, laid out five per row.

---

## 5. Analysis dialogs (M11)

- **Variant search**: bottom-docked on phones. The position slider sits above the two inputs, as in the interval control. The primary button is full width, 48px.
- **Variant results**: the banner wraps to two lines on phones and omits the locus. "Show results" opens the results table as a bottom sheet at up to 72% height.
- **Barcode generator**: bottom-docked; number inputs full width; Generate and Download full width.
- **Export**: bottom-docked; radio rows are 44px; the two steppers sit side by side; total width and height on one mono line.

---

## 6. Introgression panel and genome browser (M12)

- On touch the panel is always full screen under the top bar. Float, Dock and Maximise controls are hidden. Minimise collapses it to a 44px header bar pinned above the tab bar so the plot can be used while a job runs; Close is unchanged.
- **Phone**: form and results stack in one column and scroll together (the columns do not scroll independently). Form first, then results.
- **Tablet**: the desktop two-column grid, `minmax(250px,1fr) minmax(0,3fr)`.
- The stage stepper wraps onto more lines instead of clipping.
- The chart keeps its three tracks at 118px each and scrolls horizontally inside its frame if the block count needs more than the available width. Tapping a block shows the tooltip.
- **Genome browser dialog**: 100% width on phones (80% on tablets). The track-label column narrows from 150px to 92px.

---

## 7. Dataset upload (M2–M6)

### 7.1 Wizard shell

- **Phone**: the left step rail is replaced by a six-segment progress bar under the header, with "Step n of 6" and the step title on one line beside the Assistant button. Body padding is 16px 16px 28px.
- **Summary column**: below 1200px the right-hand summary is hidden and a summary strip is shown in its place; tapping it opens the summary as a bottom sheet (full width, max height 72%, radius 14px 14px 0 0). M3c.
- **Footer**: the hint text explaining why Continue is disabled takes its own full-width line above the buttons. Cancel and Continue then share one row, Continue on the right.
- Name and description fields stack in one column on phones.

### 7.2 Steps

- **Reference** (M2a, M2b): the "Reference id" label and its input wrap as a pair; the "n of m sequences selected" line stays on one line. The divider in the add-files bar is dropped on phones.
- **Uploads list** on phones: each row is a grid with areas `"icon name a1 a2" / "icon bar a1 a2" / "icon note a1 a2"` — file name, then progress bar, then the status note left-aligned — with two 44px action buttons on the right. The header's overall progress bar and time estimate are hidden on phones; the summary text stays.
- **Accessions table** (M2c) on touch: cards, no header row. Areas `"name name remove" / "label group remove" / "source sample remove" / "status status remove"`, 5px row gap, 8px vertical padding. Label and group stay editable inline.
- **Contig mismatch** (M2d): the rename map rows stack — VCF contig above its reference select.
- **Options** (M3a): radio cards at full width; setting labels ("Variant types", "Homozygous only") keep to one line with their control beside or beneath.
- **Review** (M3b): each issue stacks field, message, then its "Go to" link in one column.

### 7.3 Dialogs (M3d, M4)

Paste URLs, Server folder, Accession sheet, Select samples and Leave are bottom-docked on phones with 0 side margin and 8px bottom margin. List rows are 44px. In the Accession sheet dialog the preview table scrolls horizontally.

### 7.4 Build (M5)

On phones each stage row is a grid with areas `"mark name name" / "mark sub time" / "mark bar bar"`: the stage name on its own line, the count and elapsed time on the second, and the progress bar (active stage only) on the third. Tablet and desktop keep one line: `"mark name sub time"`, bar beneath.

### 7.5 Assistant (M6)

- **Phone**: full screen under the top bar.
- **Tablet**: a 380px overlay panel on the right, over the wizard, with shadow `-12px 0 40px` black at 25%.
- **Desktop**: docked, 300px, or 340px at 1200px and above (unchanged).
- The composer stays pinned to the bottom and must remain above the on-screen keyboard (`visualViewport` or `dvh` units).

---

## State and behaviour

- `sheet: 'none' | 'show' | 'where' | 'analysis' | 'output'` — which toolbar sheet is open. Opening accession selection or a dialog closes it.
- `accTab: 'table' | 'groups'` — phone-only tab in accession selection.
- `summaryOpen: boolean` — wizard summary sheet below 1200px.
- Density comes from CSS, not state.
- View state, shareable ids, autosaved drafts and resumable uploads behave as on desktop. Rotating the device or resizing across a breakpoint must not lose state or restart a job.

## Acceptance

- Checked at 360, 390, 430, 768 and 1023px wide, portrait and landscape, light and dark.
- No horizontal page scroll at any width. Tables that need it scroll inside their own frame.
- No tappable target under 44px. No button label wraps or is clipped.
- The plot pans and pinch-zooms without the page scrolling or zooming.
- Every desktop action is reachable on a phone.
- Sheets, docked dialogs and the tab bar clear the home indicator and the on-screen keyboard.

## Open items

- In a viewport shorter than 560px (phone landscape) the tab bar falls below the fold in the prototype. In the app, pin it and let the plot shrink; consider a 48px icon-only bar in landscape.
- On tablets the Leave dialog, and on phones the Review footer, wrap the primary button onto its own row in the prototype. Intended: buttons in one row, primary last; stack full-width only if they do not fit.
- The embedded JBrowse view has its own touch handling. Confirm pan and pinch inside it do not fight the dialog's scroll.
- Server-generated PhyloNet images are 800 × 400; on phones show them at full width with tap to open full size.

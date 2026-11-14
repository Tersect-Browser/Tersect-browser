# Tersect Browser — implementation spec, phase 1

Scope: the design system, the Home screen and the Browser screen. Light and dark themes. Two-row toolbar. Greyscale heatmap ramp.

Out of scope for this phase (build the triggers, leave the surfaces as stubs): accession drawer, variant search, barcode generator, export dialog, genome track (inline and dialog), introgression panel.

## Reference files in this project

| File | Use |
|---|---|
| `tersect-theme.css` | Source of truth for every token. Copy the values verbatim. |
| `Tersect Design System.dc.html` | Token swatches, type, size scale, icon map, component specimens in both themes. |
| `TersectBrowser.dc.html` | Working prototype. Open with tweaks `toolbar=double`, `ramp=grey`. Inline styles hold the exact sizes, paddings and colours. |
| `Tersect Screens.dc.html` | Artboards. Relevant sections: 1 (Home), 2 (Browser states), B2 (two-row toolbar at 1280 and 1920), 5 (context menu, tooltip). |

The prototype is a design reference, not production code. Its data is invented and its canvas drawing is a mock. Do not port its logic class; rebuild against the real API.

## Stack

React, shadcn/ui (latest), Tailwind CSS v4, Radix primitives, lucide-react. Fonts: IBM Plex Sans (400, 500, 600) and IBM Plex Mono (400, 500), self-hosted.

## 1. Design system

### 1.1 Theme

1. Put the contents of `tersect-theme.css` in `globals.css`. Rename the `[data-theme="dark"]` selector to `.dark`.
2. Add a Tailwind v4 `@theme inline` block mapping every shadcn token (`--color-background: var(--background)` and so on for the full set, including `chart-1…5` and `sidebar-*`), plus `--font-sans`, `--font-mono` and the radius scale derived from `--radius` (4px).
3. Theme switching: a `.dark` class on `<html>`, persisted in localStorage, defaulting to the OS preference. The toggle sits in the top bar (lucide `moon` / `sun`).
4. Green is used only for primary actions, selection and focus. Chrome is neutral.

### 1.2 Data-visualisation tokens

All `--viz-*` and `--group-*` values are hex so canvas code can parse them. Provide one hook, `useVizTokens()`, that reads them with `getComputedStyle` and re-reads when the theme class changes. Canvas components must redraw on that change.

Phase 1 uses these:

- Heatmap ramp: `--viz-heat-grey-0` … `--viz-heat-grey-4`, five stops, low to high distance. Interpolate linearly in RGB to build a 256-entry lookup table. Stop 0 equals the plot background in each theme, so the ramp runs white to black in light and near-black to white in dark.
- `--viz-gap`, `--viz-selection`, `--viz-label`, `--viz-tree`, `--viz-leader`, `--viz-ruler`, `--viz-variant`.
- `--group-1` … `--group-19` for the colour tracks.

Leave the indigo and mako ramp tokens in the file; do not wire them up.

### 1.3 Typography and number formatting

- Base UI text 12px / 1.35. Table and helper text 11px. Captions 10px, uppercase, 0.06em tracking, weight 600. Dialog and panel titles 14px / 600.
- Mono for accession labels, coordinates, numeric inputs and counts.
- One formatting module, used everywhere:
  - Exact position: `12,345,678`
  - Range: `12,345,678 – 12,395,678` (en dash with spaces)
  - Locus: `SL2.50ch06:12,345,678–12,395,678`
  - Ruler and summaries: `12.35 Mbp` (two decimals)
  - Sizes: `50,000 bp`
- Coordinates are right-aligned in inputs and tables.

### 1.4 Compact scale

| Token | Value | Use |
|---|---|---|
| `--control-xs` | 20px | Table filters, chips |
| `--control-sm` | 24px | Panel and footer buttons |
| `--control` | 26px | Default for toolbar and forms |
| `--control-lg` | 32px | Full-width primary |
| `--row` | 20px | Table rows |

Spacing steps 2, 4, 6, 8, 10, 12, 16px. Gap between controls 5px; between toolbar groups 10px. Icons 13px in controls, 12px in rows. Radius 4px controls, 6px popovers and menus, 8px dialogs. Focus: 1px `--ring` border plus a 2px halo at 30% opacity.

### 1.5 Components

Restyle the stock shadcn components to the scale above; set the default `size` to the 26px control. Match the specimens in `Tersect Design System.dc.html` section 6:

button, icon button, button group, input, number input, select, combobox (searchable, virtualised), multi-select with limit, slider (single and range), radio group, checkbox, popover, dialog, alert dialog, sheet, context menu, dropdown menu, tooltip, accordion, data table, progress, spinner, skeleton, toast, alert, tabs, separator, badge.

Custom components needed in phase 1:

- `IntervalControl`: two coordinate inputs (92px wide, mono, right-aligned, comma-formatted) with a dual-thumb range slider between them. Inputs and slider stay in sync.
- `TreeIcon` and `TreeSimplifiedIcon`: two custom 16px-grid SVG glyphs with a 1.5px stroke. Copy the paths from the toolbar in `TersectBrowser.dc.html`.
- Plot frame: see section 3.3.

Icon map: section 5 of the design system sheet lists the lucide icon for every action.

## 2. Home (`/`)

Reference: Screens 1a.

- Top bar: 40px, `--card` background, 1px bottom border, no shadow. Left: logo mark and "Tersect Browser" (13px / 600). Right: Home, About, theme toggle, Cranfield University logo linking to the research group. On the Browser route the dataset name and a reference-assembly badge follow the logo.
- Content column: max-width 860px, centred, 56px top padding.
- Heading 26px / 600 and a 14px muted paragraph explaining the tool (copy is in the prototype).
- Dataset list: one bordered card containing a header row and one row per dataset. Columns: dataset (name 14px / 600 with a muted description beneath), reference (mono), accession count (mono, right-aligned), arrow icon. The whole row is a link to that dataset's default view; hover uses `--accent`.
- Accession count and description may be missing from the API; render the row without them.
- Add loading (skeleton rows) and empty states.

## 3. Browser (`/share/:id`)

Reference: Screens 2a–2f, B2, 5a–5e. No page scroll. Column layout: top bar, toolbar, plot (fills the rest), status bar (24px).

### 3.1 Toolbar, two rows

Background `--card`, 1px bottom border, padding 5px 10px 7px. Each group has a 9.5px uppercase caption above its controls. A full-width 1px rule separates the rows.

Row 1:

- **Show**
  - Display style: three-way button group (accession labels / phenetic tree / phenetic tree simplified). Active segment uses `--primary`.
  - Accessions: outline button with a database icon and a count badge of selected accessions. Opens the accession drawer (stub).
  - Reference: combobox, 220px, mono, with a "Ref" prefix. Searchable and virtualised (several hundred options).
- **Where** (takes the remaining width)
  - Chromosome: select, mono.
  - `IntervalControl`; the slider stretches.
  - Bin size: 70px slider with a live mono value (`50,000 bp`), range 1,000–100,000.
  - Zoom: − / percentage / + group. 100% to 1000% in ×1.3 steps; each button disables at its limit.

Row 2:

- **Analysis** (left): Variant search with an attached Clear-highlighting icon button (disabled when there is nothing to clear); Introgression; Gene track (toggle). All are stubs in this phase.
- **Output** (right-aligned): Export (outline, disabled until the plot has loaded); Share (primary).

Labels are always visible at 1180px and above; below that, row 2 buttons show icons only with tooltips. Nothing may overlap at 1024px.

Changing reference, chromosome, interval, bin size or selection reloads the plot, debounced 700ms.

Share popover: "Link to current view", read-only mono URL field, Copy button. Show a skeleton while the link is generated; the button switches to a check icon and "Copied" for about 2 seconds.

### 3.2 Status bar and legend

24px, `--card`, 1px top border, 11px muted text.

- Left: "Distance to reference", `0`, a 110×9px gradient of the five ramp stops, `max in bin`; then a `--viz-gap` swatch labelled "Gap in reference".
- Right (mono): `{n} accessions × {m} bins`, then the interval as `30.00 – 46.00 Mbp`.

### 3.3 Plot frame

Three canvas regions that pan together, plus a corner cell.

- **Corner** (top-left, 24px tall): display-style name and accession count.
- **Ruler** (top, 24px): major and minor ticks and `12.50 Mbp` labels in `--viz-ruler`, 10px mono. Dragging selects a range, drawn as a band down the full plot height: `--viz-selection` at 18% fill with 1.5px solid edges.
- **Accession pane** (left): 176px in labels mode, 340px in tree modes; `--card` background, 1px right border.
  - Labels mode: right-aligned mono labels in `--viz-label`.
  - Tree modes: 1px lines in `--viz-tree`, labels at the leaves, dashed leader lines (2 on, 3 off) in `--viz-leader` running to the heatmap edge. The simplified tree draws collapsed clades as filled triangles.
  - The reference accession's label is drawn in `--viz-ruler`.
  - Colour tracks: 6px-wide blocks with a 2px gap between them, one per group category, at the right edge of the pane.
- **Heatmap**: one row per accession, one column per bin, nearest-neighbour scaling (`image-rendering: pixelated`). Colours from the 256-step lookup table; gaps in `--viz-gap`. Row height equals label font size and both scale with zoom.

Interactions:

- Drag on the heatmap pans. Wheel zooms.
- Hover tooltip: `--foreground` background, `--background` text, 11px mono, offset 14px right and 16px below the cursor. Content: accession label; or label plus `start – end`; or a single position; or an interval.
- Click opens a context menu (218px wide, 24px rows, mono muted header naming the target). Four variants:
  - Accession label: Set as reference; Remove from plot; View in genome browser.
  - Heatmap cell: the three accession actions, a separator, then a bin-range header with Set as interval start; Set as interval end; Search for variants; Create barcode.
  - Ruler position: Set as interval start; Set as interval end.
  - Dragged selection: Set as interval; Search for variants; Search for introgressions.
  - Actions that open out-of-scope surfaces are present and call stub handlers.

States (Screens 2d–2f):

- **Loading**: plot stays visible under a scrim of `--background` at 62%. Centred card with spinner, mono status line ("Loading...", "Collating data...", "Building tree: 45%") and a 3px progress bar.
- **Error**: same scrim. Card with a `--destructive` border, alert icon, title "The plot could not be drawn" and the server message.
- **Empty** (no accessions selected): opaque `--background`, database icon in a muted circle, "No accessions selected", one line of guidance and a primary "Select accessions" button.

## Acceptance

- Both themes pass on every screen; switching themes redraws the canvases with no reload.
- No hard-coded colours in components or canvas code; everything comes from tokens.
- Toolbar has no overlap or clipping at 1024, 1280 and 1920px. Interval inputs show `49,041,152` in full.
- Coordinates use the shared formatter everywhere.
- Table rows 20px, default controls 26px.

## Open items

- Tersect and Cranfield logo files (placeholders in the designs).
- About page has no content yet.
- Accession selection surface (drawer or docked panel) is undecided and is not part of this phase.

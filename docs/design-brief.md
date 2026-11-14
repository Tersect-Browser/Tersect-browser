# Tersect Browser — design brief

This brief describes an existing scientific web application so that a bespoke design system and a full set of screen designs can be produced for it. The application is being rebuilt as a single React app. Everything below describes what exists today; the "What we need from design" section at the end says what to produce.

## 1. What the product is

Tersect Browser is a genome-comparison tool for plant geneticists and bioinformaticians (built at Cranfield University; the current data is tomato, reference assembly SL2.50, with a few hundred sequenced accessions).

The user picks one accession as a **reference** and the tool shows, for every other accession, how genetically distant it is from that reference along a chromosome. The result is a large **heatmap**: one row per accession, one column per genomic "bin" (a fixed-width slice of the chromosome), with darkness encoding distance. Beside the heatmap is a **phenetic tree** clustering the accessions by similarity over the visible region. Long dark or light runs in a row reveal **introgressions** — stretches of DNA an accession inherited from a different lineage.

From that view the user can drill down: open a gene/variant track aligned under the heatmap, search for high-impact variants in a region, generate diagnostic DNA barcodes for an accession, and run a statistical introgression analysis.

It is a desktop, mouse-driven, data-dense analysis tool. Sessions are long. Users are experts who care about precision and screen space far more than onboarding. There are no accounts or logins.

### Glossary

| Term | Meaning |
|---|---|
| Accession | One sequenced plant sample/variety. Has an ID, a display label and arbitrary metadata columns. |
| Reference | The accession every other accession is compared against. |
| Chromosome / interval | The chromosome being viewed and the start–end positions (in base pairs, up to ~100 million) within it. |
| Bin / bin size | The interval is cut into equal slices of 1,000–100,000 bp; each is one heatmap column. |
| Distance | Number of genetic differences between an accession and the reference inside a bin. |
| Gap | A region of the reference with no sequence. Shown as its own colour, not as a distance. |
| Phenetic tree | Tree clustering the selected accessions by similarity over the current interval. |
| Group | A user-defined, named, optionally coloured set of accessions, optionally filed under a category. |
| Variant / impact | A DNA difference; "HIGH/MODERATE/LOW impact" is its predicted effect on a gene. |
| Barcode | A short DNA sequence that uniquely identifies one accession within a region. |
| Introgression | DNA from one lineage found inside another. |
| Outgroup / quartet | Inputs to the introgression analysis: a distant reference taxon, and four taxa including it. |

## 2. Why it is being redesigned

The interface today is two separately built apps stitched together:

- The main app, written in Angular 8 with the PrimeNG 8 component kit and a dated khaki-and-green jQuery-UI-style theme ("South Street").
- An "extension" that injects three newer features into the main page as web components. These use different component kits (PrimeNG 18 "Aura" and PrimeReact "Saga Green") and so look different from the host page and from each other.

The result has three visual languages on one screen, mismatched buttons and dialogs, and a toolbar that has grown by accretion. The rebuild merges everything into one React app with one design system.

## 3. Technical constraints for the design system

- **shadcn/ui (latest) on Tailwind CSS v4, Radix primitives, lucide icons.** The design system should be expressed as a shadcn theme: CSS-variable tokens (background, foreground, card, popover, primary, secondary, muted, accent, destructive, border, input, ring, chart-1…5, sidebar-*), radius, and typography. Prefer restyling stock shadcn components over inventing new ones; call out clearly anything that must be custom.
- **Light and dark themes**, both first-class.
- **Desktop only.** Minimum sensible width about 1280px; commonly used on large monitors. No mobile layout needed, but nothing should break at 1024px.
- **Density.** This is a compact UI. The accession table shows rows about 20px tall and must stay roughly that dense. Provide a compact size scale for controls.
- **The plot is drawn on HTML canvas**, not with DOM elements, and the genome track is a third-party embedded component (JBrowse 2, which uses Material UI internally). Design can specify their colours, fonts and surrounding chrome, but not restructure their internals. Plot colours must therefore be delivered as tokens the canvas code can read.
- **Data-visualisation colour is functional.** The heatmap ramp, the gap colour and the group colours carry meaning and must stay distinguishable from one another and from UI chrome, in both themes and for colour-blind users.

## 4. Application structure

Two routes only:

1. **Home** (`/`) — lists available datasets.
2. **Browser** (`/share/:id`) — the whole tool. Every view state has a shareable ID; opening a dataset opens its default view.

A persistent top bar sits above both.

### 4.1 Top bar

Dark green bar (#1b4d32), about 64px tall, with a drop shadow. Left: Tersect Browser logo. Right: "HOME" and "ABOUT" text links (About currently has no page) and the Cranfield University logo linking to the research group. Hover turns the link background bright green.

### 4.2 Home page

A single centred card, 1000px wide, on a pale khaki background. Contents: "Welcome to Tersect Browser!", a note that the page is a work in progress, and a bulleted list of datasets, each a link reading `dataset name (reference genome)`.

This page is a placeholder and wants a real design: a dataset picker that can show name, reference assembly and (in future) accession count and description, plus a short explanation of what the tool does.

### 4.3 Browser page — layout

Top to bottom:

1. Top bar.
2. **Toolbar** — one row of controls, pale cream background.
3. **Genome track strip** (optional, toggled) — an embedded JBrowse gene-model track horizontally aligned with the heatmap columns below it.
4. **Introgression panel** (optional) — appears here when an analysis is opened; can also float or maximise.
5. **Plot area** — fills all remaining height. No page scroll; the plot pans internally.

Overlays: accession drawer (from the left), several dialogs, a plot context menu, a plot tooltip.

## 5. Browser page — components in detail

### 5.1 Toolbar

Left to right today:

| Control | Type | Behaviour |
|---|---|---|
| "Genomes" label with three square icon buttons | Icon buttons | (a) **Accession display style** — opens a small popover with three radio options: *Accession labels*, *Phenetic tree*, *Phenetic tree (simplified)*. (b) **Accessions** (database icon) — opens the accession drawer. (c) **Genome track** (binoculars icon) — toggles the JBrowse strip. |
| Reference | Searchable select | Picks the reference accession from several hundred options (virtualised list with filter). |
| Chromosome | Searchable select | Around 13 options. |
| Interval | Two integer inputs + dual-thumb range slider | Start and end position, from 1 to chromosome length (tens of millions). Inputs and slider stay in sync. |
| Bin size | Single slider with live value label | 1,000 to 100,000. |
| Zoom | Two icon buttons (− / +) | 100% to 1000% in ×1.3 steps; each disables at its limit. Mouse wheel over the plot also zooms. |
| Open Variant Search | Button | Opens the variant-search dialog (5.7). |
| Refresh | Icon button | Clears variant-search highlighting from the heatmap. |
| Search For Introgression | Button | Opens the introgression panel (5.9). |
| Download | Button | Opens the export dialog (5.5). Disabled until the plot has loaded. |
| Share | Button | Opens the share popover (5.6). |

Changing reference, chromosome, interval, bin size or the accession selection reloads the plot (debounced about 0.7s).

Problems to solve: no grouping or hierarchy, three inconsistent button styles, tiny labels, and the row overflows at narrower widths. The controls fall into natural groups — *what is shown* (accessions, display style, reference), *where* (chromosome, interval, bin size, zoom), *analysis* (variant search, introgression, genome track) and *output* (download, share).

### 5.2 Plot area

Three canvas regions that pan together:

- **Scale bar** (top, 24px tall): a genomic ruler with major and minor ticks and labels such as `12.5 Mbp`, in green (#327e04), Arial. Dragging across it selects a region, shown as a translucent green band with solid edges running down the full height of the heatmap.
- **Accession pane** (left; up to half the width): depending on display style, either a plain list of accession labels, or a tree drawn with thin black lines whose leaves are the labels, with faint dashed leader lines running from each label to its heatmap row. Monospace (Courier New), black. Between the labels and the heatmap sit narrow **colour tracks**: one small coloured block per group the accession belongs to.
- **Heatmap** (right): one row per accession, one column per bin, rendered with hard pixel edges (no smoothing). White means identical to the reference, black means the most distant in that column; the ramp is a 256-step greyscale. Gaps are pale pink (rgb 240,180,180). Variant-search results highlight the matching bins.

Row height equals the label text size and both scale with zoom, so at 100% hundreds of rows fit on screen and at 1000% a handful do.

Interactions:

- Drag to pan; wheel to zoom.
- Hover shows a small dark tooltip following the cursor: accession label; or accession label plus `start – end`; or a single position; or an interval, depending on what is under the cursor.
- Click opens a context menu whose contents depend on the target (5.3).

States:

- **Loading**: the plot is dimmed by a 50% grey scrim with a centred spinner and a status line beneath it. The status text changes: "Loading...", "Collating data...", "Building tree: 45%".
- **Error**: same scrim with a centred dark rounded message, for example "At least two accessions must be selected" or "Bin size must be smaller than the selected interval".
- **Empty** (nothing selected) is currently just the error state and deserves a proper design.

### 5.3 Plot context menu

A small popup menu at the click position, with a non-clickable header naming the target and actions beneath:

- **On an accession label** — header: accession name. *Set as reference*; *Remove from plot*; *View in browser* (opens the genome-track dialog, 5.8).
- **On a heatmap cell** — two sections. Accession name: the three actions above. Bin range (`start – end`): *Set as interval start*; *Set as interval end*; *Search for variants*; *Create barcode*.
- **On a scale-bar position** — header: position. *Set as interval start*; *Set as interval end*.
- **On a dragged scale-bar selection** — header: range. *Set as interval*; *Search for variants*; *Search for introgressions*.

### 5.4 Accession drawer

A drawer from the left covering about 90% of the viewport, titled "Accession selection". Closing it applies the selection and reloads the plot. Two panes:

**Groups pane** (left, about 15% of the width). Collapsible sections, one per category plus "Uncategorized". Each lists its groups; several groups can be selected at once, which selects their accessions in the table. Each group row shows a colour swatch button, the group name, the member count in bold, and a red delete icon.

- Clicking the swatch opens a **colour picker** popover titled "Select group color": a full hue/saturation picker, a row of 20 preset swatches (19 high-contrast colours plus "no colour", shown as a crossed-out box), a preview of the current choice, and Cancel / Confirm. The presets are: #f7c100, #875492, #f78000, #9fcaf0, #c0002d, #c2b280, #008d4d, #e68eab, #0067a8, #f99179, #5e4c97, #fca300, #b43f6b, #ded200, #892610, #8eb700, #65431c, #e3541c, #273a22.
- Delete opens a **confirm dialog**: "Are you sure you want to delete the group 'X'? This will not remove any accessions." Cancel / Delete.

**Accession table** (right). Several hundred rows, virtual-scrolled, very dense (about 20px rows, small text).

- Columns are dynamic: a checkbox column, then one column per metadata field in the dataset (label, species, origin, collection number and so on — the set varies per dataset, and users can add more; see below).
- Two header rows: sortable column titles, then a filter row with a select-all checkbox and one autocomplete text filter per column.
- Above the table: *Clear selection* and *Clear filters* buttons (each disabled when not applicable).
- Rows not yet loaded show a pulsing placeholder.
- Footer: on the left, an **"Import TGRC gene…"** searchable select which, when a gene is chosen, adds a new column to the table showing each accession's allele for that gene; centre, a count reading "412 matching accessions (37 selected)"; right, **Save as a group…** (disabled with no selection).

**Add group dialog** (small, about 300px): text "Saving **37** selected accessions as a new group."; *Group name* (required); *Category* (a select that also accepts a new typed value); inline error message area; Save.

### 5.5 Export dialog

"Export plot image". Radio group *Labels*: Accession labels / Phenetic tree / Phenetic tree (simplified). Numeric steppers: *Bin / font size* (1–50), *Label width* (px). Read-only *Total width* and *Total height* (px) that update live. An indeterminate progress bar and "Loading…" button label while rendering; an inline error message; Cancel / Download.

### 5.6 Share popover

Anchored to the Share button. "Link to current view:", a read-only URL field and a *Copy* button. The link is generated when the popover opens, so it needs a brief loading state, and a copied confirmation.

### 5.7 Variant search dialog

Titled "Variant Search". Two alternative ways to search, separated by a divider:

1. **By interval**: a dual-thumb *Position range (bp)* slider with two numeric inputs ("to" between them), and a *Choose Impact* select (HIGH / MODERATE / LOW).
2. **By gene ID** (optional): an autocomplete text field with placeholder "Start typing…". When a gene ID is entered the interval section is dimmed because it no longer applies.

A full-width primary button "Search for variants", which becomes "Searching…" with a spinner. Searches can take tens of seconds. On completion the dialog closes and matching bins are highlighted on the heatmap. It can be opened pre-filled from the plot context menu.

There is currently no results list — only the heatmap highlight — and no way to tell how many variants or accessions matched. A results summary would be a welcome addition.

### 5.8 Genome track (JBrowse)

Appears in two places:

- **Inline strip** above the plot: a single gene-model track (rows of gene glyphs) whose horizontal scale and scroll position are locked to the heatmap, so genes line up with heatmap columns. Its own header and navigation are hidden. It needs a clear visual relationship to the heatmap beneath it and a tidy loading state (currently the plain text "Loading...").
- **Dialog**, opened by *View in browser* on an accession: 80% of viewport width, titled with the accession name. Shows a full JBrowse view with its own navigation: reference sequence, gene models, and that accession's variant track.

### 5.9 Barcode generator dialog

About 40% of viewport width. Heading "Barcode Generator", two paragraphs of explanatory text, then: *Barcode size (bp)* (number, 10–1000); *Maximum number of variants allowed per barcode (optional)* (number); a *Generate* button with an inline spinner while running; and, once finished, a *Download* button for the resulting file. The dialog is opened for a specific accession and bin range, which it should display but currently does not.

### 5.10 Introgression analysis panel

The most complex surface. A **window-like panel** that sits docked between the toolbar and the plot so the heatmap stays usable while an analysis runs. Its header has a title, "Introgression analysis", and four window controls: *Minimise* (collapse to the header), *Float/Dock* (detach into a draggable, resizable floating window), *Maximise/Restore* (full screen), and *Close*.

The body is split roughly 1:3.

**Left — form:**

- *Choose outgroup* — searchable select of the current accessions; required.
- *Choose 4 taxa (must include outgroup)* — searchable multi-select limited to exactly four; helper text "Quartet for window scan analysis"; validation messages "Quartet must include the selected outgroup." and "Please select exactly 4 taxa."
- *Block size* — number, 5–100; helper "Amount of gene trees per block".
- *Max reticulations* — number, 2–4; helper "Maximum number of reticulations to be used in phylonet".
- Actions: *Cancel*, *Run analysis* (primary, with loading state), and *Clear results* once there is a result or an error.

**Right — results**, with four states:

- **Empty**: "Results will appear here after you run the analysis."
- **Running**: spinner, "Running analysis…", and a live status line streamed from the server ("Generating species tree", "Generating gene trees", "PhyloNet analysis started" …). Runs take minutes and pass through several named stages, so a stepped progress indicator would suit it better than a bare spinner.
- **Error**: a red-bordered box, "Error: …".
- **Results**, arriving in two parts:
  1. A **three-track chart** sharing one x-axis (genomic position in Mb), each track about 160px tall, titled "Triplet scan (B=50) — DCT (top), BLT (middle), Hybrid (bottom)":
     - Track 1, *Topology proportion*: stacked bars per block in three series — T1 species-tree topology (grey #999999), T2 discordant topology 1 (blue #1f77b4), T3 discordant topology 2 (orange #ff7f0e) — with a dashed purple "expected discordance" reference line and red star markers on statistically significant blocks. A legend for T1/T2/T3 sits above the chart.
     - Track 2, *BLT (Mann–Whitney U)*: a blue line with points and a dashed grey threshold line.
     - Track 3, *Distance-weighted discordance*: a black line with markers — gold stars for significant blocks, dark circles otherwise.
     - Hovering a block shows a tooltip with its statistics.
  2. Later, **PhyloNet output**: its own "Running PhyloNet analysis…" status, then a *Download PhyloNet output* link and two server-generated images (800×400), "PhyloNet Plot" and "PhyloNet Output" (a network diagram with hybridisation events).

## 6. Current visual language (for reference, not to preserve)

| Element | Today |
|---|---|
| Brand greens | Deep green #1b4d32 (top bar, drawer header); action green #459e00 with border #327e04; hover #33b357 / #67b021 |
| Surfaces | Khaki page rgb(240,239,208); cream panels #f5f3e5; headers #ece8da; borders #d4ccb0 / #dfd9c3 |
| Text | #312e25 / #433f38 |
| Error | Orange-on-yellow (#cd5c0a on #ffedad) in the old kit; white on #ff7c7c for messages; red #E33C3C for delete icons |
| Type | Segoe UI / Arial for UI; Verdana for nav; Courier New for accession labels; Arial for the ruler |
| Radius | 6px |
| Icons | Font Awesome 4, plus two custom glyphs for "tree" and "simplified tree" |
| Assets | Tersect Browser logo (PNG), Cranfield University logo (PNG) |

The green identity and the Cranfield association are worth keeping in spirit. The khaki palette, bevelled controls and mixed typefaces are not.

## 7. What we need from design

**A design system**, as a shadcn/Tailwind v4 theme:

1. Colour tokens for light and dark themes, covering the standard shadcn set.
2. A separate, named **data-visualisation palette**: heatmap ramp (low → high distance), gap colour, selection/highlight band, variant-match highlight, tree line and leader-line colours, ruler colour, the T1/T2/T3 series and the significance markers, and a revised 19-colour categorical set for accession groups. All of it must work in both themes.
3. Typography: a UI family, and a monospace or tabular family for accession labels, genomic coordinates and numeric inputs. Coordinates should be formatted consistently everywhere (for example `12,345,678` and `12.35 Mbp`).
4. A compact spacing and control-size scale suitable for a dense analysis tool.
5. Icon choices from lucide for every action listed above, and a decision on the two tree-style glyphs.
6. Styled versions of the shadcn components this app uses: button and icon button, button group, input, number input, select and combobox (searchable, virtualised for long lists), multi-select with a selection limit, single and range slider, radio group, checkbox, popover, dialog, alert dialog, sheet/drawer, context menu, dropdown menu, tooltip, accordion, data table (sortable, per-column filter, row selection, virtual scroll), progress, spinner, skeleton, toast, alert, tabs, separator, badge.

**Custom components** that need designing because shadcn has no equivalent:

- The plot frame: ruler, accession pane, colour tracks, heatmap, the divider between panes, loading/error/empty overlays, the plot tooltip, and a **legend** for the heatmap ramp and gap colour (there is none today).
- Genomic interval control (two coordinate inputs plus a range slider).
- Colour picker with preset swatches and a "no colour" option.
- The dockable/floating/maximisable analysis panel with its window controls.
- A multi-stage progress indicator for long-running server jobs.
- The three-track introgression chart and its legend and tooltip.
- The frame around the embedded genome track, inline and in a dialog.

**Screen designs**, light and dark:

1. Home — dataset picker.
2. Browser — default state with labels; with phenetic tree; loading; error; empty.
3. Browser with the genome track strip open.
4. Toolbar on its own, at 1280px and at 1920px.
5. Plot context menu — all four variants; plot tooltip.
6. Accession drawer — default; with filters and a selection; add-group dialog; colour picker; delete confirmation.
7. Export dialog; share popover.
8. Variant search dialog — idle, gene-ID mode, searching; and the heatmap with results highlighted.
9. Barcode generator — idle, generating, ready to download.
10. Genome track dialog for one accession.
11. Introgression panel — docked, floating, minimised and maximised; form with validation errors; running; error; results with the chart; results with PhyloNet output.

Open questions where design input is welcome: how to regroup the toolbar; whether the accession drawer should stay a near-full-width drawer or become a dedicated panel; where a persistent heatmap legend lives; and how variant-search results should be summarised beyond highlighting.

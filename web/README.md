# Tersect Browser — web

The Tersect Browser frontend: a single React application that replaces the
Angular frontend (`frontend/`) and the genome-browser extension (`extension/`).

Stack: React 19, TypeScript, Vite, Tailwind CSS v4, shadcn/ui (Radix), Zustand,
TanStack Query, D3 and JBrowse 2.

## Running

The backend must be running (see the repository README). Node 22.12 or newer
is required.

```sh
npm install
npm run dev        # http://localhost:4200/<baseHref>
```

The dev server reads `../tbconfig.json` for two values: `baseHref`, the path
the app is served under, and `serverPort`, where API requests are proxied to.
Three environment variables override the defaults:

| Variable           | Purpose                                                    |
| ------------------ | ---------------------------------------------------------- |
| `TB_CONFIG`        | Path to the config file, relative to `web/`                |
| `BACKEND_URL`      | Backend origin to proxy to, e.g. `http://backend:4300`     |
| `TB_ALLOWED_HOSTS` | Comma-separated extra host names the dev server may answer |

Other scripts:

```sh
npm run build      # type-check, then build into ../dist/frontend
npm run typecheck
npm run lint
npm run format
```

`npm run build` writes to `../dist/frontend`, the directory the deployed
backend serves the frontend from. The Angular build writes to the same place,
so build one or the other.

## Layout

```
src/
  components/ui/   shadcn components (added with `npx shadcn add <name>`)
  components/      app shell and theme provider
  pages/           the two routes: dataset list and the browser
  features/        one folder per feature of the browser page
    toolbar/         reference, chromosome, interval, bin size, zoom, actions
    plot/            the distance plot, its tooltip and context menu
    accessions/      accession drawer: table, groups, colours, TGRC import
    export/          image export and share link
    variants/        variant search
    barcode/         barcode generator
    jbrowse/         inline genome track and per-accession genome dialog
    introgression/   introgression analysis window and chart
  plot/            framework-free plot engine: view models and canvas drawing
  store/           Zustand stores: view settings / plot data, and UI state
  hooks/           data loading for the plot
  lib/             API client, shared types, genomic helpers
```

## Theming

The design system follows `HANDOFF.md` at the repository root. All colours,
the compact control scale and the data-visualisation palette are CSS custom
properties in `src/index.css`, in the shadcn layout (`:root` for light,
`.dark` for dark). The block between the `tersect-theme.css: begin` and `end`
markers is meant to be replaced verbatim by the designers' `tersect-theme.css`
(renaming `[data-theme="dark"]` to `.dark`).

The distance plot is drawn on canvas, so it cannot be styled with classes.
It reads the `--viz-*` tokens through `useVizTokens()` (`src/hooks`), which
re-reads them when the theme changes, so the canvases redraw on a theme
switch. Group colour presets come from `--group-1` to `--group-19`. Exported
images always use the light values.

Numbers shown to the user (positions, ranges, loci, Mbp, sizes) go through
`src/lib/format.ts` so they read the same everywhere.

## Genome browser configuration

`src/features/jbrowse/generated/` holds the JBrowse assembly and track
definitions. They are written by the dataset setup scripts
(`modules_for_setup.py`) and should not be edited by hand. File locations in
them are re-rooted onto the current origin at load time, so the host that was
configured when the dataset was set up does not matter.

/**
 * Custom glyphs on a 16px grid with a 1.5px stroke, for actions lucide has no
 * icon for.
 *
 * INTERIM: the handoff says to copy these paths from the prototype
 * (`TersectBrowser.dc.html`), which was not available when this was written.
 */
function Glyph({ children, ...props }: React.ComponentProps<"svg">) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  )
}

/** Phenetic tree with branch lengths. */
export function TreeIcon(props: React.ComponentProps<"svg">) {
  return (
    <Glyph {...props}>
      <path d="M1.5 8H4M4 4v8M4 4h4M8 2.5v3M8 2.5h6.5M8 5.5h4M4 12h5M9 10.5v3M9 10.5h3.5M9 13.5h5.5" />
    </Glyph>
  )
}

/** Phenetic tree with equal branch lengths (topology only). */
export function TreeSimplifiedIcon(props: React.ComponentProps<"svg">) {
  return (
    <Glyph {...props}>
      <path d="M1.5 8H5M5 4v8M5 4h4.5M9.5 2.5v3M9.5 2.5h5M9.5 5.5h5M5 12h4.5M9.5 10.5v3M9.5 10.5h5M9.5 13.5h5" />
    </Glyph>
  )
}

/** Interim logo mark: a small heatmap. */
export function LogoMark(props: React.ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden {...props}>
      <rect width="16" height="16" rx="3" fill="var(--primary)" />
      <g fill="var(--primary-foreground)">
        <rect x="3" y="3" width="3" height="2" opacity="0.9" />
        <rect x="7" y="3" width="3" height="2" opacity="0.4" />
        <rect x="11" y="3" width="2" height="2" opacity="0.7" />
        <rect x="3" y="7" width="3" height="2" opacity="0.4" />
        <rect x="7" y="7" width="3" height="2" opacity="0.9" />
        <rect x="11" y="7" width="2" height="2" opacity="0.3" />
        <rect x="3" y="11" width="3" height="2" opacity="0.7" />
        <rect x="7" y="11" width="3" height="2" opacity="0.3" />
        <rect x="11" y="11" width="2" height="2" opacity="0.9" />
      </g>
    </svg>
  )
}

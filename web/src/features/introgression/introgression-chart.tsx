import { useEffect, useMemo, useRef, useState } from "react"

import { useVizTokens } from "@/hooks/use-viz-tokens"

import { isSignificant, type ScanResponse, type TripletBlock } from "./types"

/** Three tracks sharing an x-axis (9.4). */
const LEFT = 40
const RIGHT = 10
const TRACK_HEIGHT = 118
const TRACK_TOPS = [20, 172, 324]
const HEIGHT = TRACK_TOPS[2] + TRACK_HEIGHT + 32
const TITLES = [
  "Topology proportion",
  "BLT (Mann–Whitney U)",
  "Distance-weighted discordance",
]
/** Significance level drawn as the BLT threshold. */
const ALPHA = 0.05

interface Placed {
  block: TripletBlock
  index: number
  start: number
  end: number
  mid: number
  t1: number
  t2: number
  t3: number
}

function css(name: string) {
  return (
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() ||
    "#888"
  )
}

function star(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string
) {
  ctx.fillStyle = color
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5
    const r = i % 2 ? radius * 0.45 : radius
    ctx.lineTo(x + Math.cos(angle) * r, y + Math.sin(angle) * r)
  }
  ctx.closePath()
  ctx.fill()
}

/** Tick step in Mb giving about `count` ticks over `span` Mb. */
function tickStep(span: number, count: number) {
  const raw = span / count
  const power = 10 ** Math.floor(Math.log10(raw))
  return [1, 2, 5, 10].map((m) => m * power).find((s) => s >= raw) ?? raw
}

export function IntrogressionChart({ data }: { data: ScanResponse }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [width, setWidth] = useState(0)
  const [hover, setHover] = useState<number | null>(null)
  const tokens = useVizTokens()

  useEffect(() => {
    const element = containerRef.current
    if (!element) {
      return
    }
    const observer = new ResizeObserver(() => setWidth(element.clientWidth))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const placed = useMemo<Placed[]>(() => {
    const blocks = data.blocks
    return blocks.map((block, index) => {
      const total = Math.max(1, block.n_T1 + block.n_T2 + block.n_T3)
      // Older results have only the midpoint: span to the neighbours.
      const prev = blocks[index - 1]?.mid_BP
      const next = blocks[index + 1]?.mid_BP
      const half =
        ((next ?? block.mid_BP) - (prev ?? block.mid_BP)) /
        (prev !== undefined && next !== undefined ? 4 : 2)
      return {
        block,
        index,
        start: block.start_BP ?? block.mid_BP - half,
        end: block.end_BP ?? block.mid_BP + half,
        mid: block.mid_BP,
        t1: block.n_T1 / total,
        t2: block.n_T2 / total,
        t3: block.n_T3 / total,
      }
    })
  }, [data])

  const [domainStart, domainEnd] = useMemo(() => {
    if (!placed.length) {
      return [0, 1]
    }
    return [
      Math.min(...placed.map((p) => p.start)),
      Math.max(...placed.map((p) => p.end)),
    ]
  }, [placed])
  const plotWidth = Math.max(1, width - LEFT - RIGHT)
  const x = (position: number) =>
    LEFT +
    ((position - domainStart) / (domainEnd - domainStart || 1)) * plotWidth

  const dwdMax = useMemo(
    () =>
      Math.max(
        1,
        ...placed.map((p) =>
          Number.isFinite(p.block.obs_disc_frac)
            ? (p.block.obs_disc_frac ?? 0)
            : 0
        )
      ),
    [placed]
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !width) {
      return
    }
    const ratio = window.devicePixelRatio || 1
    canvas.width = width * ratio
    canvas.height = HEIGHT * ratio
    canvas.style.width = `${width}px`
    canvas.style.height = `${HEIGHT}px`
    const ctx = canvas.getContext("2d")
    if (!ctx) {
      return
    }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    ctx.clearRect(0, 0, width, HEIGHT)

    const color = {
      t1: css("--viz-t1"),
      t2: css("--viz-t2"),
      t3: css("--viz-t3"),
      sig: css("--viz-sig"),
      gold: css("--viz-sig-gold"),
      expected: css("--viz-expected"),
      threshold: css("--viz-threshold"),
      label: css("--viz-label"),
      leader: css("--viz-leader"),
      selection: css("--viz-selection"),
      muted: css("--muted-foreground"),
    }
    const sans = css("--font-sans")
    const mono = css("--font-mono")
    const yOf = (track: number, value: number) =>
      TRACK_TOPS[track] + TRACK_HEIGHT * (1 - value)

    // Hovered block: a band down all three tracks.
    if (hover !== null && placed[hover]) {
      const p = placed[hover]
      ctx.fillStyle = color.selection
      ctx.globalAlpha = 0.14
      ctx.fillRect(
        x(p.start),
        TRACK_TOPS[0],
        Math.max(2, x(p.end) - x(p.start)),
        TRACK_TOPS[2] + TRACK_HEIGHT - TRACK_TOPS[0]
      )
      ctx.globalAlpha = 1
    }

    // Frames, titles and y labels
    TRACK_TOPS.forEach((top, track) => {
      ctx.font = `600 11px ${sans}`
      ctx.fillStyle = color.label
      ctx.textAlign = "left"
      ctx.textBaseline = "alphabetic"
      ctx.fillText(TITLES[track], LEFT, top - 6)
      ctx.strokeStyle = color.leader
      ctx.lineWidth = 1
      ctx.strokeRect(LEFT + 0.5, top + 0.5, plotWidth, TRACK_HEIGHT)
      ctx.font = `10px ${mono}`
      ctx.fillStyle = color.muted
      ctx.textAlign = "right"
      ctx.textBaseline = "middle"
      const labels =
        track === 2
          ? [dwdMax, dwdMax / 2, 0].map((v) => v.toFixed(1))
          : ["1.0", "0.5", "0"]
      labels.forEach((text, i) =>
        ctx.fillText(text, LEFT - 5, top + (i * TRACK_HEIGHT) / 2)
      )
    })

    // 1. Topology proportion: stacked T1, T2, T3
    for (const p of placed) {
      const left = x(p.start) + 1
      const barWidth = Math.max(1, x(p.end) - x(p.start) - 2)
      let y = yOf(0, 0)
      for (const [value, fill] of [
        [p.t1, color.t1],
        [p.t2, color.t2],
        [p.t3, color.t3],
      ] as const) {
        const h = value * TRACK_HEIGHT
        ctx.fillStyle = fill
        ctx.fillRect(left, y - h, barWidth, h)
        y -= h
      }
    }
    const dashed = (y: number, stroke: string) => {
      ctx.strokeStyle = stroke
      ctx.lineWidth = 1.5
      ctx.setLineDash([5, 4])
      ctx.beginPath()
      ctx.moveTo(LEFT, y)
      ctx.lineTo(LEFT + plotWidth, y)
      ctx.stroke()
      ctx.setLineDash([])
    }
    // Expected discordance under ILS: where T1 would end.
    const expected = placed.find((p) => p.block.exp_disc_frac != null)?.block
      .exp_disc_frac
    if (expected != null) {
      dashed(yOf(0, 1 - expected), color.expected)
    }
    for (const p of placed) {
      if (isSignificant(p.block)) {
        star(ctx, x(p.mid), TRACK_TOPS[0] + 9, 5, color.sig)
      }
    }

    // 2. BLT: p-value per block, with the significance threshold
    dashed(yOf(1, ALPHA), color.threshold)
    const line = (
      track: number,
      value: (p: Placed) => number | null | undefined,
      stroke: string
    ) => {
      ctx.strokeStyle = stroke
      ctx.lineWidth = 1.5
      ctx.beginPath()
      let started = false
      for (const p of placed) {
        const v = value(p)
        if (v == null || !Number.isFinite(v)) {
          continue
        }
        const px = x(p.mid)
        const py = yOf(track, v)
        if (started) {
          ctx.lineTo(px, py)
        } else {
          ctx.moveTo(px, py)
          started = true
        }
      }
      ctx.stroke()
    }
    line(1, (p) => p.block.p_blt, color.t2)
    for (const p of placed) {
      const v = p.block.p_blt
      if (v != null && Number.isFinite(v)) {
        ctx.fillStyle = color.t2
        ctx.beginPath()
        ctx.arc(x(p.mid), yOf(1, v), 2.5, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    // 3. Distance-weighted discordance
    const dwd = (p: Placed) =>
      p.block.obs_disc_frac == null ? null : p.block.obs_disc_frac / dwdMax
    line(2, dwd, color.label)
    for (const p of placed) {
      const v = dwd(p)
      if (v == null || !Number.isFinite(v)) {
        continue
      }
      if (isSignificant(p.block)) {
        star(ctx, x(p.mid), yOf(2, v), 6, color.gold)
      } else {
        ctx.fillStyle = color.label
        ctx.beginPath()
        ctx.arc(x(p.mid), yOf(2, v), 2.5, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    // Shared x-axis in Mb
    ctx.font = `10px ${mono}`
    ctx.fillStyle = color.muted
    ctx.textAlign = "center"
    ctx.textBaseline = "top"
    const startMb = domainStart / 1e6
    const endMb = domainEnd / 1e6
    const step = tickStep(endMb - startMb, Math.max(2, plotWidth / 90))
    for (let mb = Math.ceil(startMb / step) * step; mb <= endMb; mb += step) {
      ctx.fillText(
        mb.toFixed(step < 1 ? 1 : 0),
        x(mb * 1e6),
        TRACK_TOPS[2] + TRACK_HEIGHT + 5
      )
    }
    ctx.fillText(
      "Position (Mb)",
      LEFT + plotWidth / 2,
      TRACK_TOPS[2] + TRACK_HEIGHT + 18
    )
    // x() and plotWidth only change with the inputs listed below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placed, width, hover, tokens, dwdMax, domainStart, domainEnd])

  const hovered = hover !== null ? placed[hover] : undefined

  return (
    <div ref={containerRef} className="relative">
      <canvas
        ref={canvasRef}
        className="block"
        aria-label="Introgression scan results"
        role="img"
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          const px = event.clientX - rect.left
          const found = placed.findIndex(
            (p) => px >= x(p.start) && px <= x(p.end)
          )
          setHover(found >= 0 ? found : null)
        }}
        onMouseLeave={() => setHover(null)}
      />
      {hovered && (
        <div
          className="pointer-events-none absolute top-[30px] z-10 grid grid-cols-[auto_auto] gap-x-2.5 gap-y-px rounded-[4px] border bg-popover px-2 py-1.5 font-mono text-[11px] whitespace-nowrap text-popover-foreground shadow-[0_4px_14px_rgb(0_0_0/0.2)]"
          style={
            x(hovered.end) + 220 < width
              ? { left: x(hovered.end) + 8 }
              : { right: width - x(hovered.start) + 8 }
          }
        >
          <span className="col-span-2 font-sans font-semibold">
            Block {hovered.index + 1}
            {isSignificant(hovered.block) && " · significant"}
          </span>
          <span className="col-span-2 mb-[3px] text-muted-foreground">
            {(hovered.start / 1e6).toFixed(2)} –{" "}
            {(hovered.end / 1e6).toFixed(2)} Mb
          </span>
          <span>T1</span>
          <span className="text-right">{hovered.t1.toFixed(3)}</span>
          <span>T2</span>
          <span className="text-right">{hovered.t2.toFixed(3)}</span>
          <span>T3</span>
          <span className="text-right">{hovered.t3.toFixed(3)}</span>
          <span>BLT p</span>
          <span className="text-right">
            {hovered.block.p_blt?.toPrecision(2) ?? "–"}
          </span>
          <span>DWD</span>
          <span className="text-right">
            {hovered.block.obs_disc_frac?.toFixed(3) ?? "–"}
          </span>
        </div>
      )}
    </div>
  )
}

import * as d3 from "d3"
import { useEffect, useRef } from "react"

import { formatMbp } from "@/lib/format"

import type { ScanResponse, TripletBlock } from "./types"

const TRACK_HEIGHT = 160
/** Widest a topology bar may be, in pixels. */
const MAX_BAR_WIDTH = 24
const TRACK_GAP = 18
const MARGIN = { top: 40, right: 64, bottom: 36, left: 64 }
const TOTAL_HEIGHT = MARGIN.top + TRACK_HEIGHT * 3 + TRACK_GAP * 2 + 40

const COLORS = {
  T1: "var(--chart-topology-1)",
  T2: "var(--chart-topology-2)",
  T3: "var(--chart-topology-3)",
  expected: "var(--chart-expected)",
  significant: "var(--chart-significant)",
  significantFill: "var(--chart-significant-fill)",
}

const formatExponent = (value?: number | null) =>
  value != null ? value.toExponential(2) : "NA"
const formatFixed = (value?: number | null) =>
  value != null ? value.toFixed(3) : "NA"

/** Blocks where the species tree dominates and T2 outnumbers T3. */
const isCandidate = (block: TripletBlock) =>
  block.n_T3 < block.n_T2 && block.n_T1 > block.n_T2

function tooltipHtml(block: TripletBlock): string {
  const discordant = (block.n_T2 + block.n_T3) / Math.max(1, block.n_total ?? 1)
  return `
    mid: ${(block.mid_BP / 1e6).toFixed(2)} Mb<br/>
    <b>DCT</b><br/>
    n: ${block.n_total} (T2=${block.n_T2}, T3=${block.n_T3})<br/>
    disc. frac: ${discordant.toFixed(3)}<br/>
    expected: ${formatFixed(block.exp_disc_frac)}<br/>
    p_sym(FDR): ${formatExponent(block.p_sym_fdr)}<br/>
    p_sym: ${formatExponent(block.p_sym)}<br/>
    <b>BLT</b><br/>
    mannwhitneyu: ${formatExponent(block.p_blt)}<br/>
    delta: ${formatFixed(block.delta)} &nbsp; p_blt(FDR): ${formatExponent(block.p_blt_fdr)}<br/>
    <b>Hybrid</b><br/>
    mean_discordance: ${formatFixed(block.obs_disc_frac)}<br/>
    asymmetry: ${formatFixed(block.asymmetry_score)}<br/>
  `
}

function render(element: HTMLDivElement, data: ScanResponse) {
  const width = element.clientWidth
  element.replaceChildren()
  const blocks = [...(data.blocks ?? [])].sort((a, b) => a.mid_BP - b.mid_BP)
  if (!width || blocks.length === 0) {
    return
  }
  const innerWidth = Math.max(0, width - MARGIN.left - MARGIN.right)

  const svg = d3
    .select(element)
    .append("svg")
    .attr("width", width)
    .attr("height", TOTAL_HEIGHT)
    .style("color", "var(--foreground)")
    .style("font-family", "inherit")
  const root = svg
    .append("g")
    .attr("transform", `translate(${MARGIN.left},${MARGIN.top})`)

  const tooltip = d3
    .select(element)
    .append("div")
    .attr(
      "class",
      "pointer-events-none absolute hidden rounded-md border bg-popover px-2 py-1.5 text-xs text-popover-foreground shadow-md"
    )
  const showTip = (event: MouseEvent, block: TripletBlock) => {
    const [x, y] = d3.pointer(event, element)
    tooltip
      .classed("hidden", false)
      .html(tooltipHtml(block))
      .style("left", `${Math.min(x + 14, width - 240)}px`)
      .style("top", `${y + 14}px`)
  }
  const hideTip = () => tooltip.classed("hidden", true)

  const x = d3
    .scaleLinear()
    .domain(d3.extent(blocks, (block) => block.mid_BP) as [number, number])
    .nice()
    .range([0, innerWidth])

  const axisLabel = (
    track: d3.Selection<SVGGElement, unknown, null, undefined>,
    text: string
  ) =>
    track
      .append("text")
      .attr("x", -TRACK_HEIGHT / 2)
      .attr("y", -44)
      .attr("transform", "rotate(-90)")
      .attr("text-anchor", "middle")
      .attr("fill", "currentColor")
      .style("font-size", "12px")
      .text(text)

  /* ------------------------------------ Track 1: topology proportions -- */
  const track1 = root.append("g")
  const y1 = d3.scaleLinear().domain([0, 1]).nice().range([TRACK_HEIGHT, 0])
  track1.append("g").call(d3.axisLeft(y1).ticks(5))
  axisLabel(track1, "Topology proportion")

  const barWidth = Math.min((innerWidth / blocks.length) * 0.6, MAX_BAR_WIDTH)
  // Keep marks that sit at the edge of the domain inside the plot area.
  const clipId = `introgression-clip-${Math.random().toString(36).slice(2)}`
  svg
    .append("defs")
    .append("clipPath")
    .attr("id", clipId)
    .append("rect")
    .attr("width", innerWidth)
    .attr("height", TRACK_HEIGHT)
  const bars = track1.append("g").attr("clip-path", `url(#${clipId})`)
  for (const block of blocks) {
    let yBase = TRACK_HEIGHT
    for (const key of ["T1", "T2", "T3"] as const) {
      const proportion =
        block.n_total > 0 ? block[`n_${key}`] / block.n_total : 0
      const height = TRACK_HEIGHT - y1(proportion)
      bars
        .append("rect")
        .attr("x", x(block.mid_BP) - barWidth / 2)
        .attr("y", yBase - height)
        .attr("width", barWidth)
        .attr("height", height)
        .style("fill", COLORS[key])
        .attr("opacity", key === "T1" ? 0.8 : 0.85)
      yBase -= height
    }
  }
  bars
    .selectAll<SVGRectElement, unknown>("rect")
    .on("mousemove", (event: MouseEvent) => {
      const [px] = d3.pointer(event, bars.node())
      const position = x.invert(px)
      const nearest = d3.least(blocks, (block) =>
        Math.abs(block.mid_BP - position)
      )
      if (nearest) {
        showTip(event, nearest)
      }
    })
    .on("mouseleave", hideTip)

  const expected = blocks.find(
    (block) => block.exp_disc_frac != null
  )?.exp_disc_frac
  if (expected != null) {
    track1
      .append("line")
      .attr("x1", 0)
      .attr("x2", innerWidth)
      .attr("y1", y1(expected))
      .attr("y2", y1(expected))
      .style("stroke", COLORS.expected)
      .attr("stroke-dasharray", "4,3")
      .attr("stroke-width", 1.2)
    track1
      .append("text")
      .attr("x", innerWidth - 4)
      .attr("y", y1(expected) - 6)
      .attr("text-anchor", "end")
      .style("fill", COLORS.expected)
      .style("font-size", "11px")
      .text("expected discordance")
  }

  track1
    .selectAll("text.star")
    .data(
      blocks.filter(
        (block) =>
          isCandidate(block) && Math.abs(block.asymmetry_score ?? 0) < 1
      )
    )
    .enter()
    .append("text")
    .attr("class", "star")
    .attr("x", (block) => x(block.mid_BP))
    .attr("y", (block) =>
      y1(block.n_total > 0 ? block.n_T1 / block.n_total : 0)
    )
    .attr("text-anchor", "middle")
    .style("fill", COLORS.significant)
    .style("font-size", "12px")
    .text("★")

  /* ------------------------------------------ Track 2: branch lengths -- */
  const track2 = root
    .append("g")
    .attr("transform", `translate(0,${TRACK_HEIGHT + TRACK_GAP})`)
  const withDelta = blocks.filter(
    (block): block is TripletBlock & { delta: number } => block.delta != null
  )
  const deltas = blocks
    .map((block) => block.delta ?? 0)
    .filter((value) => Number.isFinite(value))
  const deltaMin = d3.min(deltas) ?? -0.1
  const deltaMax = d3.max(deltas) ?? 0.1
  const deltaPad = (deltaMax - deltaMin) * 0.1 || 0.05
  const y2 = d3
    .scaleLinear()
    .domain([deltaMin - deltaPad, deltaMax + deltaPad])
    .nice()
    .range([TRACK_HEIGHT, 0])
  track2.append("g").call(d3.axisLeft(y2).ticks(5))
  axisLabel(track2, "BLT (Mann-Whitney U)")

  track2
    .append("line")
    .attr("x1", 0)
    .attr("x2", innerWidth)
    .attr("y1", y2(0))
    .attr("y2", y2(0))
    .attr("stroke", "currentColor")
    .attr("opacity", 0.5)
    .attr("stroke-dasharray", "4,3")
  track2
    .append("path")
    .datum(withDelta)
    .attr("fill", "none")
    .style("stroke", COLORS.T2)
    .attr("stroke-width", 1.6)
    .attr(
      "d",
      d3
        .line<TripletBlock & { delta: number }>()
        .x((block) => x(block.mid_BP))
        .y((block) => y2(block.delta))
    )
  track2
    .selectAll("circle.blt")
    .data(withDelta)
    .enter()
    .append("circle")
    .attr("class", "blt")
    .attr("cx", (block) => x(block.mid_BP))
    .attr("cy", (block) => y2(block.delta))
    .attr("r", 3)
    .style("fill", COLORS.T2)
    .attr("opacity", 0.8)
    .on("mousemove", (event: MouseEvent, block) => showTip(event, block))
    .on("mouseleave", hideTip)
  // Ring around blocks significant after FDR correction.
  track2
    .selectAll("circle.blt-significant")
    .data(withDelta.filter((block) => (block.p_blt_fdr ?? 1) < 0.05))
    .enter()
    .append("circle")
    .attr("class", "blt-significant")
    .attr("cx", (block) => x(block.mid_BP))
    .attr("cy", (block) => y2(block.delta))
    .attr("r", 6)
    .attr("fill", "none")
    .style("stroke", COLORS.T2)
    .attr("stroke-width", 1.5)
    .on("mousemove", (event: MouseEvent, block) => showTip(event, block))
    .on("mouseleave", hideTip)

  /* --------------------------- Track 3: distance-weighted discordance -- */
  const track3 = root
    .append("g")
    .attr("transform", `translate(0,${(TRACK_HEIGHT + TRACK_GAP) * 2})`)
  const withObserved = blocks.filter(
    (block): block is TripletBlock & { obs_disc_frac: number } =>
      block.obs_disc_frac != null && Number.isFinite(block.obs_disc_frac)
  )
  const observedMin = d3.min(withObserved, (block) => block.obs_disc_frac) ?? 0
  const observedMax = d3.max(withObserved, (block) => block.obs_disc_frac) ?? 1
  const observedPad = (observedMax - observedMin) * 0.1 || 0.05
  const y3 = d3
    .scaleLinear()
    .domain([observedMin - observedPad, observedMax + observedPad])
    .nice()
    .range([TRACK_HEIGHT, 0])
  track3.append("g").call(d3.axisLeft(y3).ticks(5))
  axisLabel(track3, "Dist weighted discordance")

  track3
    .append("path")
    .datum(withObserved)
    .attr("fill", "none")
    .attr("stroke", "currentColor")
    .attr("stroke-width", 1.6)
    .attr(
      "d",
      d3
        .line<TripletBlock & { obs_disc_frac: number }>()
        .x((block) => x(block.mid_BP))
        .y((block) => y3(block.obs_disc_frac))
    )
  track3
    .selectAll("path.hybrid")
    .data(withObserved)
    .enter()
    .append("path")
    .attr("class", "hybrid")
    .attr("d", (block) =>
      d3
        .symbol()
        .type(isCandidate(block) ? d3.symbolStar : d3.symbolCircle)
        .size(80)()
    )
    .attr(
      "transform",
      (block) => `translate(${x(block.mid_BP)},${y3(block.obs_disc_frac)})`
    )
    .style("fill", (block) =>
      isCandidate(block) ? COLORS.significantFill : "currentColor"
    )
    .attr("opacity", 0.9)
    .on("mousemove", (event: MouseEvent, block) => showTip(event, block))
    .on("mouseleave", hideTip)

  /* -------------------------------------------- shared axis and title -- */
  root
    .append("g")
    .attr(
      "transform",
      `translate(0,${(TRACK_HEIGHT + TRACK_GAP) * 2 + TRACK_HEIGHT})`
    )
    .call(
      d3
        .axisBottom(x)
        .ticks(8)
        .tickFormat((value) => formatMbp(Number(value)))
    )
  root
    .append("text")
    .attr("x", 0)
    .attr("y", -14)
    .attr("font-weight", 600)
    .attr("fill", "currentColor")
    .style("font-size", "13px")
    .text(
      `Triplet scan (B=${data.params.block_size}) - DCT (top), BLT (middle), Hybrid (bottom)`
    )
}

/**
 * Results of the window scan along the region, as three tracks sharing one
 * genomic axis: topology proportions, branch-length test and hybrid score.
 */
export function IntrogressionChart({ data }: { data: ScanResponse }) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = containerRef.current
    if (!element) {
      return
    }
    let width = element.clientWidth
    render(element, data)
    // Rendering changes the height; only a new width needs a redraw.
    const observer = new ResizeObserver(() => {
      if (element.clientWidth !== width) {
        width = element.clientWidth
        render(element, data)
      }
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [data])

  return <div ref={containerRef} className="relative w-full" />
}

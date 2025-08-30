import { Component, ElementRef, Input, OnChanges, AfterViewInit, OnDestroy, ViewChild } from '@angular/core';
import * as d3 from 'd3';


interface TripletBlock {
  mid_BP: number;
  obs_disc_frac?: number | null;
  asymmetry_score: number ;
  p_blt: number;

  // DCT
  n_T1: number; n_T2: number; n_T3: number; n_total: number;
  p_sym_fdr?: number | null;
  p_sym?: number;
  exp_disc_frac?: number | null; // expected discordant fraction (if tau available)

  // BLT
  delta?: number | null;
  mean_T2?: number | null;
  mean_T3?: number | null;
  p_blt_fdr?: number | null;


}

interface ScanParams { block_size: number; }
interface ScanResponse {
  params: ScanParams;
  blocks: TripletBlock[];
}

@Component({
  selector: 'app-introgression-visualizer',
  standalone: true,
  template: `<div #container class="plot-container"></div>`,
  styleUrl: './introgression-visualizer.component.css'
})
export class IntrogressionVisualizerComponent implements OnChanges, AfterViewInit, OnDestroy {
  @Input() data!: ScanResponse;
  @ViewChild('container', { static: true }) container!: ElementRef<HTMLDivElement>;

  private ro?: ResizeObserver;
  private hasView = false;

  ngAfterViewInit() {
    this.hasView = true;
    this.ro = new ResizeObserver(() => this.render());
    this.ro.observe(this.container.nativeElement);
    if (this.data) this.render();
  }
  ngOnChanges() { if (this.hasView && this.data) this.render(); }
  ngOnDestroy() { this.ro?.disconnect(); }

  private render() {
    const el = this.container.nativeElement;
    if (!this.data) return;

    const width = el.parentElement?.parentElement?.clientWidth;
    if (!width) { requestAnimationFrame(() => this.render()); return; }

    // --- Layout
    const H_TRACK = 160;            // px height per track
    const GAP = 18;                 // px between tracks
    const N_TRACKS = 3;
    const height = 40 + (H_TRACK * N_TRACKS) + (GAP * (N_TRACKS - 1)) + 40; // top/bottom margins + tracks + gaps
    const margin = { top: 40, right: 64, bottom: 36, left: 64 };
    const innerW = Math.max(0, width - margin.left - margin.right);
    const totalH = Math.max(0, height);

    const getYforStar = (d: TripletBlock) => {
      const p1 = d.n_total > 0 ? d.n_T1 / d.n_total : 0;
       const hT1 = y1(p1);
      return hT1;
    }

    el.innerHTML = '';
    const svg = d3.select(el).append('svg').attr('width', width).attr('height', totalH);
    const root = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const blocks = (this.data.blocks ?? []).slice().sort((a,b)=>a.mid_BP-b.mid_BP);
    if (blocks.length === 0) return;
    // Collect obs_disc values
    const obsVals = blocks
      .map(d => d.obs_disc_frac)
      .filter(v => v != null && isFinite(v as number)) as number[];

    const yMin = d3.min(obsVals) ?? 0;
    const yMax = d3.max(obsVals) ?? 1;

    // add 10% padding
    const padY = (yMax - yMin) * 0.1 || 0.05;

    const frac = (d: TripletBlock) => (d.n_T2 + d.n_T3) / Math.max(1, d.n_total ?? 1);


    // --- X scale (shared)
    const xDomain = d3.extent(blocks, d => d.mid_BP) as [number, number];
    const x = d3.scaleLinear().domain(xDomain).nice().range([0, innerW]);

    // --- Tooltip FIRST (before any event handlers!)
    d3.select(el).selectAll('div.tooltip').remove();
    const tooltip = d3.select(el).append('div')
      .attr('class', 'tooltip')
      .style('position', 'absolute')
      .style('pointer-events', 'none')
      .style('background', '#fff')
      .style('border', '1px solid #ccc')
      .style('padding', '6px 8px')
      .style('border-radius', '4px')
      .style('font-size', '12px')
      .style('display', 'none');

    const fmtExp = (v?: number | null) => v != null ? v.toExponential(2) : 'NA';
    const fmtFix = (v?: number | null, d=3) => v != null ? v.toFixed(d) : 'NA';

    const showTip = (event: MouseEvent, d: TripletBlock) => {
      const [px, py] = d3.pointer(event, el);
      tooltip.style('display', 'block').html(`
        mid: ${(d.mid_BP/1e6).toFixed(2)} Mb<br/>
        <b>DCT</b><br/>
        n: ${d.n_total} (T2=${d.n_T2}, T3=${d.n_T3})<br/>
        disc. frac: ${frac(d).toFixed(3)}<br/>
        expected: ${d.exp_disc_frac != null ? d.exp_disc_frac.toFixed(3) : 'NA'}<br/>
        p_sym(FDR): ${fmtExp(d.p_sym_fdr)}<br/>
        p_sym: ${fmtExp(d.p_sym)}<br/>
        <b>BLT</b><br/>
        mannwhitneyu: ${fmtExp(d.p_blt)}<br/>
        mannwhitneyu_FDR: ${fmtFix(d.delta)} &nbsp; p_blt(FDR): ${fmtExp(d.p_blt_fdr)}<br/>
        <b>Hybrid</b><br/>
        mean_discordance: ${fmtFix(d.obs_disc_frac)}<br/>
        asymmetry: ${fmtFix(d.asymmetry_score)}<br/>

      `);
      tooltip.style('left', `${px + 14}px`).style('top', `${py + 14}px`);
    };
    const hideTip = () => tooltip.style('display', 'none');

    // Helper: compute visual bar width per block from neighbor gaps

    const barWidth = innerW / blocks.length * 0.3;
    const widths = blocks.map(() => barWidth);

    // ============= Track 1: DCT (stacked T1/T2/T3 + discordant fraction + baseline) =============
    const track1 = root.append('g').attr('transform', `translate(0,0)`);
    const h1 = H_TRACK;

    // y scale for proportions (0..1)
    const b_size = this.data.params.block_size
    const y1 = d3.scaleLinear().domain([0, 1]).nice().range([h1, 0]);
    const y1_based_on = d3.scaleLinear().domain([(yMin - padY) * b_size, (yMax + padY) * b_size]).nice().range([h1, 0]);

    // axes
    track1.append('g').attr('class', 'y axis').call(d3.axisLeft(y1).ticks(5));
    track1.append('text')
      .attr('x', -h1 / 2).attr('y', -44)
      .attr('transform', 'rotate(-90)').attr('text-anchor', 'middle')
      .text('Topology proportion');

    // stacked bars for T1/T2/T3
    const colors = { T1: '#999999', T2: '#1f77b4', T3: '#ff7f0e' };
    const barGroup = track1.append('g').attr('class', 'bars');

    blocks.forEach((d, i) => {
      const xCenter = x(d.mid_BP);
      const w = widths[i];
      const p1 = d.n_total > 0 ? d.n_T1 / d.n_total : 0;
      const p2 = d.n_total > 0 ? d.n_T2 / d.n_total : 0;
      const p3 = d.n_total > 0 ? d.n_T3 / d.n_total : 0;

      let yBase = h1;

      // T1
      const hT1 = h1 - y1(p1);
      barGroup.append('rect')
        .attr('x', xCenter - w/2).attr('y', yBase - hT1)
        .attr('width', w).attr('height', hT1)
        .attr('fill', colors.T1).attr('opacity', 0.8);
      yBase -= hT1;

      // T2
      const hT2 = h1 - y1(p2);
      barGroup.append('rect')
        .attr('x', xCenter - w/2).attr('y', yBase - hT2)
        .attr('width', w).attr('height', hT2)
        .attr('fill', colors.T2).attr('opacity', 0.85);
      yBase -= hT2;

      // T3
      const hT3 = h1 - y1(p3);
      barGroup.append('rect')
        .attr('x', xCenter - w/2).attr('y', yBase - hT3)
        .attr('width', w).attr('height', hT3)
        .attr('fill', colors.T3).attr('opacity', 0.85);
    });

    const fdr_y = d3.scaleLinear().domain([-0.05, 0.05]).nice().range([h1, 0]);

    // discordant fraction line (T2+T3)/total
      // const discLine = d3.line<TripletBlock>()
      //   .x(d => x(d.mid_BP))
      //   .y(d => fdr_y(d?.p_sym_fdr ? d.p_sym_fdr : 0));
      // track1.append('path')
      //   .datum(blocks)
      //   .attr('fill', 'none').attr('stroke', '#d62728').attr('stroke-width', 1.4)
      //   .attr('d', discLine);

    // expected baseline (2/3*e^{-tau}) if available per block (assumed constant)
    const anyExp = blocks.some(b => b.exp_disc_frac != null);
    if (anyExp) {
      const expVal = (blocks.find(b => b.exp_disc_frac != null)?.exp_disc_frac as number) ?? null;
      if (expVal != null) {
        track1.append('line')
          .attr('x1', 0).attr('x2', innerW)
          .attr('y1', y1(expVal)).attr('y2', y1(expVal))
          .attr('stroke', '#6a3d9a').attr('stroke-dasharray', '4,3').attr('stroke-width', 1.2);
        track1.append('text')
          .attr('x', innerW - 4).attr('y', y1(expVal) - 6)
          .attr('text-anchor', 'end').attr('fill', '#6a3d9a')
          .style('font-size', '11px')
          .text('expected discordance');
      }
    }

    // significance stars for p_sym_fdr
    const starBlocks = blocks.filter(b => b.n_T3 < b.n_T2 && b.n_T1 > b.n_T2);

    track1.selectAll('text.star')
      .data(starBlocks)
      .enter()
      .append('text')
      .attr('class', 'star')
      .attr('x', d => x(d.mid_BP))
      .attr('y', d => (Math.abs(d?.asymmetry_score) < 1 ) ? getYforStar(d) : -999)
      .attr('text-anchor', 'middle')
      .attr('fill', '#d62728')
      .style('font-size', '12px')
      .text('★');

    // ============= Track 2: BLT (delta = mean_T2 − mean_T3) =============
    const track2 = root.append('g').attr('transform', `translate(0,${H_TRACK + GAP})`);
    const h2 = H_TRACK;

    const deltas = blocks.map(d => d.delta ?? 0).filter(v => Number.isFinite(v));
    const dMin = d3.min(deltas) ?? -0.1;
    const dMax = d3.max(deltas) ?? 0.1;
    const pad = (dMax - dMin) * 0.1 || 0.05;

    const y2 = d3.scaleLinear().domain([dMin - pad, dMax + pad]).nice().range([h2, 0]);
    track2.append('g').attr('class', 'y axis').call(d3.axisLeft(y2).ticks(5));
    track2.append('text')
      .attr('x', -h2 / 2).attr('y', -44)
      .attr('transform', 'rotate(-90)').attr('text-anchor', 'middle')
      .style('font-size', '12px')
      .text('BLT(mannwhitneyu)');

    // zero line
    track2.append('line')
      .attr('x1', 0).attr('x2', innerW)
      .attr('y1', y2(0)).attr('y2', y2(0))
      .attr('stroke', '#999').attr('stroke-width', 1).attr('stroke-dasharray', '4,3');

    // line + points
    const lineBLT = d3.line<TripletBlock>()
      .defined(d => d.delta != null)
      .x(d => x(d.mid_BP))
      .y(d => y2(d.delta as number));

    track2.append('path')
      .datum(blocks.filter(d => d.delta != null))
      .attr('fill', 'none').attr('stroke', '#1f77b4').attr('stroke-width', 1.6)
      .attr('d', lineBLT);

    track2.selectAll('circle.blt')
      .data(blocks.filter(d => d.delta != null))
      .enter()
      .append('circle')
      .attr('class', 'blt')
      .attr('cx', d => x(d.mid_BP))
      .attr('cy', d => y2(d.delta as number))
      .attr('r', 3)
      .attr('fill', '#1f77b4')
      .attr('opacity', 0.8)
      .on('mousemove', (e, d) => showTip(e as MouseEvent, d))
      .on('mouseleave', hideTip);

    // significance highlight for p_blt_fdr
    track2.selectAll('circle.blt-sig')
      .data(blocks.filter(d => (d.p_blt_fdr ?? 1) < 0.05 && d.delta != null))
      .enter()
      .append('circle')
      .attr('class', 'blt-sig')
      .attr('cx', d => x(d.mid_BP))
      .attr('cy', d => y2(d.delta as number))
      .attr('r', 6)
      .attr('fill', 'none')
      .attr('stroke', '#1f77b4')
      .attr('stroke-width', 1.5)
      .on('mousemove', (e, d) => showTip(e as MouseEvent, d))
      .on('mouseleave', hideTip);

    // ============= Track 3: Hybrid/original (obs_disc line + mode labels) =============
    const track3 = root.append('g').attr('transform', `translate(0,${(H_TRACK + GAP)*2})`);
    const h3 = H_TRACK;

    // Y scale for obs_disc fractions (0..1)
    const y3 = d3.scaleLinear()
      .domain([yMin - padY, yMax + padY])
      .nice()
      .range([h3, 0]);
    track3.append('g').call(d3.axisLeft(y3).ticks(5));
    track3.append('text')
      .attr('x', -h3 / 2).attr('y', -44)
      .attr('transform', 'rotate(-90)').attr('text-anchor', 'middle')
      .style('font-size', '12px')
      .text('Dist weighted discordance');

    // obs_disc line
    const lineHybrid = d3.line<TripletBlock>()
      .defined(d => d.obs_disc_frac != null)
      .x(d => x(d.mid_BP))
      .y(d => y3(d.obs_disc_frac as number));

    track3.append('path')
      .datum(blocks.filter(d => d.obs_disc_frac != null))
      .attr('fill', 'none').attr('stroke', '#000').attr('stroke-width', 1.6)
      .attr('d', lineHybrid);

    // Mode-encoded points
    const symbolForSignificantBlock = (d: TripletBlock) => {
      if(d.n_T3 < d.n_T2 && d.n_T1 > d.n_T2) return d3.symbolStar;
      return d3.symbolCircle
    };

    const fillForBlock = (d: TripletBlock) => {
  if(d.n_T3 < d.n_T2 && d.n_T1 > d.n_T2) {
    return "#ffcc00";   // gold fill for stars
  }
  return "#222";        // dark fill for circles
};

    track3.selectAll('path.hybrid')
      .data(blocks.filter(d => d.obs_disc_frac != null))
      .enter()
      .append('path')
      .attr('class', 'hybrid')
      .attr('d', d => d3.symbol().type(symbolForSignificantBlock(d)).size(80)())
      .attr('transform', d => `translate(${x(d.mid_BP)},${y3(d.obs_disc_frac as number)})`)
      .attr("fill", d => fillForBlock(d))
      .attr('opacity', 0.9)
      .on('mousemove', (e, d) => showTip(e as MouseEvent, d))
      .on('mouseleave', hideTip);

    // --- Shared X axis at the bottom of the last track
    root.append('g')
      .attr('transform', `translate(0,${(H_TRACK + GAP)*2 + h3})`)
      .call(d3.axisBottom(x).ticks(8).tickFormat(d => `${Math.round(+d / 1e6)} Mb` as any));

    // --- Hover wiring for DCT bars (attach after bars exist)
    barGroup.selectAll<SVGRectElement, unknown>('rect')
      .on('mousemove', (e, _r) => {
        // hit-test approximate: find nearest block by x
        const [px] = d3.pointer(e, barGroup.node() as any);
        const xVal = x.invert(px);
        // nearest by mid_BP
        const nearest = blocks.reduce((best, b) => {
          const dv = Math.abs(b.mid_BP - xVal);
          return (!best || dv < best.dv) ? { dv, b } : best;
        }, null as null | { dv: number, b: TripletBlock });
        if (nearest) showTip(e as MouseEvent, nearest.b);
      })
      .on('mouseleave', hideTip);

    // Title
    root.append('text')
      .attr('x', 0).attr('y', -14)
      .attr('font-weight', '600')
      .text(`Triplet scan (B=${this.data.params.block_size}) — DCT (top), BLT (middle), Hybrid (bottom)`);
  }
}

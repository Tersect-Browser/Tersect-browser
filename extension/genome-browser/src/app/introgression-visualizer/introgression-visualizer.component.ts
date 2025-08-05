import { Component, ElementRef, Input, OnChanges, AfterViewInit, OnDestroy, ViewChild } from '@angular/core';
import * as d3 from 'd3';
import { ScanResponse, TripletBlock } from './types';

@Component({
  selector: 'app-introgression-visualizer',
  standalone: true,
  template: `<div #container class="plot-container"></div>`,
  styleUrl: './introgression-visualizer.component.css'
})
export class IntrogressionVisualizerComponent implements OnChanges, AfterViewInit, OnDestroy {
  @Input() data!: ScanResponse;
  @ViewChild('container', { static: true }) container!: ElementRef<HTMLDivElement>;
  @Input() set offset(v: number | null | undefined) {
    console.log('[plot-view] set offset received', v);
    const next = (v ?? 0);
    if (next !== this._offset) {
      this._offset = next;
      if (this.hasView) this.scheduleRender(); // re-render on offset change
    }
  }

  private ro?: ResizeObserver;
    private renderQueued = false;
  private hasView = false;
    private _offset = 0;

  get offset() { return this._offset; }

  private scheduleRender() {
    if (this.renderQueued) return;
    this.renderQueued = true;
    requestAnimationFrame(() => {
      this.renderQueued = false;
      this.render();
    });
  }


  ngAfterViewInit() {
    this.hasView = true;
    // Observe width changes (e.g., panels toggling)
    this.ro = new ResizeObserver(() => this.render());
    this.ro.observe(this.container.nativeElement);
    if (this.data) this.render();
  }

  ngOnChanges() {
    if (this.hasView && this.data) this.render();
  }

  ngOnDestroy() {
    this.ro?.disconnect();
  }



  private render() {
    const el = this.container.nativeElement;
    if (!this.data) return;
    console.log(el.parentElement?.parentElement?.clientWidth, el.getBoundingClientRect().width, el.parentElement?.clientWidth);
    // Fixed height; responsive width
    const width = el.parentElement?.parentElement?.clientWidth;
    const height = 300;  // <— as requested

    // If width is zero (hidden), try again on next frame.
    if (!width) {
      requestAnimationFrame(() => this.render());
      return;
    }

    // Clear previous
    el.innerHTML = '';
    const TITLE_OFFSET = 14; // px above the plot area
    const margin = { top: TITLE_OFFSET + 20, right: 18, bottom: 36, left: 56 };
    const w = Math.max(0, width - margin.left - margin.right);
    const h = Math.max(0, height - margin.top - margin.bottom);

    const svg = d3.select(el)
      .append('svg')
      .attr('width', width)
      .attr('height', height);

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const blocks = this.data.blocks ?? [];
    const xDomain = (d3.extent(blocks, d => d.mid_BP) as [number, number]) ?? [0, 1];
    const yMax = d3.max(blocks, d => d.obs_disc_frac) ?? 1;

    const x = d3.scaleLinear().domain(xDomain).nice().range([0, w]);
    const y = d3.scaleLinear().domain([0, yMax]).nice().range([h, 0]);

    const xAxis = d3.axisBottom(x).ticks(8).tickFormat(d => `${Math.round(+d / 1e6)} Mb`);
    const yAxis = d3.axisLeft(y).ticks(6);

    g.append('g').attr('class', 'x-axis').attr('transform', `translate(0,${h})`).call(xAxis);
    g.append('g').attr('class', 'y-axis').call(yAxis);

    // Axis labels
    g.append('text')
      .attr('x', w / 2)
      .attr('y', h + 32)
      .attr('text-anchor', 'middle')
      .text('Genomic position');

    g.append('text')
      .attr('x', -h / 2)
      .attr('y', -42)
      .attr('transform', 'rotate(-90)')
      .attr('text-anchor', 'middle')
      .text('Discordance fraction');

    // Tooltip
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

const showTip = (e: MouseEvent, d: TripletBlock) => {
  const [px, py] = d3.pointer(e, el);      // coords relative to `el`
  const margin = 14;

  // Set content & reveal so we can measure dimensions
  tooltip
    .style('display', 'block')
    .html(
      `mid: ${(d.mid_BP/1e6).toFixed(2)} Mb<br/>
       obs: ${d.obs_disc_frac.toFixed(3)}<br/>
       exp: ${d.exp_disc_frac.toFixed(3)}<br/>
       n: ${d.n_trees} (T2=${d.count_T2}, T3=${d.count_T3})<br/>
       p_total(FDR): ${d.p_total_fdr.toExponential(2)}<br/>
       p_sym(FDR): ${d.p_sym_fdr.toExponential(2)}`
    );

  const node = tooltip.node() as HTMLElement;
  const tipW = node.offsetWidth;
  const tipH = node.offsetHeight;

  const { width: cw, height: ch } = (el as HTMLElement).getBoundingClientRect();

  // Default: bottom-right of the pointer
  let left = px + margin;
  let top  = py + margin;

  // Flip horizontally if it would overflow to the right
  if (left + tipW > cw) {
    left = px - margin - tipW;
  }
  // Flip vertically if it would overflow to the bottom
  if (top + tipH > ch) {
    top = py - margin - tipH;
  }

  // Clamp inside container as a last resort
  left = Math.max(0, Math.min(left, cw - tipW));
  top  = Math.max(0, Math.min(top,  ch - tipH));

  tooltip.style('left', `${left}px`).style('top', `${top}px`);
};

    const hideTip = () => tooltip.style('display', 'none');

    // Points
    g.selectAll('circle.base')
      .data(blocks)
      .enter()
      .append('circle')
      .attr('class', 'base')
      .attr('cx', d => x(d.mid_BP))
      .attr('cy', d => y(d.obs_disc_frac))
      .attr('r', 3)
      .attr('fill', '#ff0000ff')
      .attr('opacity', 0.6)
      .on('mousemove', (e, d) => showTip(e as MouseEvent, d as TripletBlock))
      .on('mouseleave', hideTip);

    // Sister introgression significant: cross
    const sisterSig = blocks.filter(d => d.mode === 'sister_introgression' && d.sig_total);
    g.selectAll('path.sister')
      .data(sisterSig)
      .enter()
      .append('path')
      .attr('class', 'sister')
      .attr('d', d3.symbol().type(d3.symbolCross).size(80))
      .attr('transform', d => `translate(${x(d.mid_BP)},${y(d.obs_disc_frac)})`)
      .attr('fill', 'none')
      .attr('stroke', '#000')
      .attr('stroke-width', 1.5)
      .on('mousemove', (e, d) => showTip(e as MouseEvent, d as TripletBlock))
      .on('mouseleave', hideTip);

    // Non-sister introgression significant: hollow circle
    const nonsisterSig = blocks.filter(d => d.mode === 'nonsister_test' && d.sig_total && d.sig_sym);
    g.selectAll('circle.nonsister')
      .data(nonsisterSig)
      .enter()
      .append('circle')
      .attr('class', 'nonsister')
      .attr('cx', d => x(d.mid_BP))
      .attr('cy', d => y(d.obs_disc_frac))
      .attr('r', 6)
      .attr('fill', 'none')
      .attr('stroke', '#d95f02')
      .attr('stroke-width', 1.5)
      .on('mousemove', (e, d) => showTip(e as MouseEvent, d as TripletBlock))
      .on('mouseleave', hideTip);

    // Title
    g.append('text')
      .attr('x', 0)
       .attr('y', -TITLE_OFFSET)
      .attr('font-weight', '600')
      .text(`Triplet scan (B=${this.data.params.block_size}); global p=${this.data.global.p_global.toExponential(2)}`);
  }
}

// import { Component, ElementRef, Input, OnChanges, AfterViewInit, OnDestroy, ViewChild } from '@angular/core';
// import * as d3 from 'd3';
// import { ScanResponse, TripletBlock, D3Block } from './types';

// type Mode = 'topology' | 'd3' | 'unknown';

// @Component({
//   selector: 'app-introgression-visualizer',
//   standalone: true,
//   template: `<div #container class="plot-container"></div>`,
//   styleUrl: './introgression-visualizer.component.css'
// })
// export class IntrogressionVisualizerComponent implements OnChanges, AfterViewInit, OnDestroy {
//   @Input() data!: ScanResponse;
//   @ViewChild('container', { static: true }) container!: ElementRef<HTMLDivElement>;

//   @Input() set offset(v: number | null | undefined) {
//     const next = (v ?? 0);
//     if (next !== this._offset) {
//       this._offset = next;
//       if (this.hasView) this.scheduleRender();
//     }
//   }
//   get offset() { return this._offset; }

//   private ro?: ResizeObserver;
//   private renderQueued = false;
//   private hasView = false;
//   private _offset = 0;

//   ngAfterViewInit() {
//     this.hasView = true;
//     this.ro = new ResizeObserver(() => this.render());
//     this.ro.observe(this.container.nativeElement);
//     if (this.data) this.render();
//   }
//   ngOnChanges() { if (this.hasView && this.data) this.render(); }
//   ngOnDestroy() { this.ro?.disconnect(); }

//   private scheduleRender() {
//     if (this.renderQueued) return;
//     this.renderQueued = true;
//     requestAnimationFrame(() => { this.renderQueued = false; this.render(); });
//   }

//   private detectMode(blocks: any[]): Mode {
//     if (!blocks || blocks.length === 0) return 'unknown';
//     const b = blocks[0];
//     if ('obs_disc_frac' in b) return 'topology';
//     if ('d3' in b || 'p_d3' in b || 'sig_d3' in b) return 'd3';
//     return 'unknown';
//   }

//   private render() {
//     const el = this.container.nativeElement;
//     if (!this.data) return;

//     const width = el.parentElement?.parentElement?.clientWidth;
//     const height = 300;
//     if (!width) { requestAnimationFrame(() => this.render()); return; }

//     el.innerHTML = '';
//     const TITLE_OFFSET = 14;
//     const margin = { top: TITLE_OFFSET + 20, right: 18, bottom: 36, left: 56 };
//     const w = Math.max(0, width - margin.left - margin.right);
//     const h = Math.max(0, height - margin.top - margin.bottom);

//     const svg = d3.select(el).append('svg').attr('width', width).attr('height', height);
//     const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

//     const blocks: any[] = (this.data as any).blocks ?? [];
//     const mode = this.detectMode(blocks);

//     // Shared x-scale
//     const xDomain = (d3.extent(blocks, d => +d.mid_BP) as [number, number]) ?? [0, 1];
//     const x = d3.scaleLinear().domain(xDomain).nice().range([0, w]);
//     const xAxis = d3.axisBottom(x).ticks(8).tickFormat(d => `${Math.round(+d / 1e6)} Mb`);

//     // Tooltip shared container
//     d3.select(el).selectAll('div.tooltip').remove();
//     const tooltip = d3.select(el).append('div')
//       .attr('class', 'tooltip')
//       .style('position', 'absolute')
//       .style('pointer-events', 'none')
//       .style('background', '#fff')
//       .style('border', '1px solid #ccc')
//       .style('padding', '6px 8px')
//       .style('border-radius', '4px')
//       .style('font-size', '12px')
//       .style('display', 'none');

//     const placeTip = (e: MouseEvent) => {
//       const [px, py] = d3.pointer(e, el);
//       const node = tooltip.node() as HTMLElement;
//       const tipW = node.offsetWidth, tipH = node.offsetHeight;
//       const { width: cw, height: ch } = (el as HTMLElement).getBoundingClientRect();
//       const m = 14;
//       let left = px + m, top = py + m;
//       if (left + tipW > cw) left = px - m - tipW;
//       if (top + tipH > ch) top = py - m - tipH;
//       left = Math.max(0, Math.min(left, cw - tipW));
//       top  = Math.max(0, Math.min(top,  ch - tipH));
//       tooltip.style('left', `${left}px`).style('top', `${top}px`);
//     };
//     const hideTip = () => tooltip.style('display', 'none');

//     if (mode === 'topology') {
//       // ---------- OLD: topology plot ----------
//       const yMax = d3.max(blocks, d => +d.obs_disc_frac) ?? 1;
//       const y = d3.scaleLinear().domain([0, yMax]).nice().range([h, 0]);
//       const yAxis = d3.axisLeft(y).ticks(6);

//       g.append('g').attr('class', 'x-axis').attr('transform', `translate(0,${h})`).call(xAxis);
//       g.append('g').attr('class', 'y-axis').call(yAxis);

//       // Labels
//       g.append('text').attr('x', w / 2).attr('y', h + 32).attr('text-anchor', 'middle').text('Genomic position');
//       g.append('text').attr('x', -h / 2).attr('y', -42).attr('transform', 'rotate(-90)').attr('text-anchor', 'middle')
//         .text('Discordance fraction');

//       // Points
//       g.selectAll('circle.base')
//         .data(blocks).enter().append('circle')
//         .attr('class', 'base')
//         .attr('cx', d => x(+d.mid_BP))
//         .attr('cy', d => y(+d.obs_disc_frac))
//         .attr('r', 3).attr('fill', '#ff0000ff').attr('opacity', 0.6)
//         .on('mousemove', (e, d: TripletBlock) => {
//           tooltip.style('display', 'block').html(
//             `mid: ${(d.mid_BP/1e6).toFixed(2)} Mb<br/>
//              obs: ${d.obs_disc_frac.toFixed(3)}<br/>
//              exp: ${d.exp_disc_frac.toFixed(3)}<br/>
//              n: ${d.n_trees} (T2=${d.count_T2}, T3=${d.count_T3})<br/>
//              p_total(FDR): ${d.p_total_fdr.toExponential(2)}<br/>
//              p_sym(FDR): ${d.p_sym_fdr.toExponential(2)}`
//           ); placeTip(e as MouseEvent);
//         })
//         .on('mouseleave', hideTip);

//       // Sister significant (cross)
//       const sisterSig = blocks.filter(d => d.mode === 'sister_introgression' && d.sig_total);
//       g.selectAll('path.sister').data(sisterSig).enter().append('path')
//         .attr('class', 'sister')
//         .attr('d', d3.symbol().type(d3.symbolCross).size(80))
//         .attr('transform', d => `translate(${x(+d.mid_BP)},${y(+d.obs_disc_frac)})`)
//         .attr('fill', 'none').attr('stroke', '#000').attr('stroke-width', 1.5)
//         .on('mousemove', (e, d: TripletBlock) => {
//           tooltip.style('display', 'block').html(
//             `mid: ${(d.mid_BP/1e6).toFixed(2)} Mb<br/>
//              obs: ${d.obs_disc_frac.toFixed(3)}<br/>
//              exp: ${d.exp_disc_frac.toFixed(3)}<br/>
//              n: ${d.n_trees} (T2=${d.count_T2}, T3=${d.count_T3})<br/>
//              p_total(FDR): ${d.p_total_fdr.toExponential(2)}<br/>
//              p_sym(FDR): ${d.p_sym_fdr.toExponential(2)}`
//           ); placeTip(e as MouseEvent);
//         })
//         .on('mouseleave', hideTip);

//       // Non-sister significant (ring)
//       const nonsisterSig = blocks.filter(d => d.mode === 'nonsister_test' && d.sig_total && d.sig_sym);
//       g.selectAll('circle.nonsister').data(nonsisterSig).enter().append('circle')
//         .attr('class', 'nonsister')
//         .attr('cx', d => x(+d.mid_BP)).attr('cy', d => y(+d.obs_disc_frac))
//         .attr('r', 6).attr('fill', 'none').attr('stroke', '#d95f02').attr('stroke-width', 1.5)
//         .on('mousemove', (e, d: TripletBlock) => { /* same tooltip */ placeTip(e as MouseEvent); })
//         .on('mouseleave', hideTip);

//       g.append('text').attr('x', 0).attr('y', -TITLE_OFFSET).attr('font-weight', '600')
//         .text(`Triplet scan (B=${(this.data as any).params.block_size}); global p=${(this.data as any).global.p_global.toExponential(2)}`);

//     } else if (mode === 'd3') {
//       // ---------- NEW: D3 plot ----------
//       const d3Blocks = blocks as D3Block[];
//       const yAbsMax = Math.max(
//         0.1,
//         d3.max(d3Blocks, d => Math.abs(d.d3 ?? 0)) ?? 0.1
//       );
//       const pad = 1.1;
//       const y = d3.scaleLinear()
//         .domain([-Math.min(1, yAbsMax * pad), Math.min(1, yAbsMax * pad)])
//         .range([h, 0]);

//       const yAxis = d3.axisLeft(y).ticks(6);
//       g.append('g').attr('class', 'x-axis').attr('transform', `translate(0,${h})`).call(xAxis);
//       g.append('g').attr('class', 'y-axis').call(yAxis);

//       // Baseline at 0
//       g.append('line')
//         .attr('x1', 0).attr('x2', w)
//         .attr('y1', y(0)).attr('y2', y(0))
//         .attr('stroke', '#888').attr('stroke-dasharray', '4,4');

//       // Labels
//       g.append('text').attr('x', w / 2).attr('y', h + 32).attr('text-anchor', 'middle')
//         .text('Genomic position');
//       g.append('text').attr('x', -h / 2).attr('y', -42).attr('transform', 'rotate(-90)').attr('text-anchor', 'middle')
//         .text('D3 = (dP2P3 - dP1P3) / (dP2P3 + dP1P3)');

//       // Error bars if se_d3 present (±1.96 SE)
//       const withSE = d3Blocks.filter(b => b.d3 !== null && b.se_d3 !== null && isFinite(b.se_d3 as number));
//       g.selectAll('line.err')
//         .data(withSE).enter().append('line')
//         .attr('class', 'err')
//         .attr('x1', d => x(d.mid_BP)).attr('x2', d => x(d.mid_BP))
//         .attr('y1', d => y((d.d3 as number) - 1.96 * (d.se_d3 as number)))
//         .attr('y2', d => y((d.d3 as number) + 1.96 * (d.se_d3 as number)))
//         .attr('stroke', '#999').attr('stroke-width', 1);

//       // Points
//       g.selectAll('circle.base')
//         .data(d3Blocks).enter().append('circle')
//         .attr('class', 'base')
//         .attr('cx', d => x(d.mid_BP))
//         .attr('cy', d => y((d.d3 ?? 0)))
//         .attr('r', 3)
//         .attr('fill', d => {
//           // Optional: color by sign; neutral gray for nulls
//           if (d.d3 == null) return '#bbb';
//           return (d.d3 < 0) ? '#1b9e77' : '#7570b3';
//         })
//         .attr('opacity', 0.7)
//         .on('mousemove', (e, d: D3Block) => {
//           const q = (d as any).p_d3_fdr ?? d.p_d3; // show FDR if present, else raw
//           tooltip.style('display', 'block').html(
//             `mid: ${(d.mid_BP/1e6).toFixed(2)} Mb<br/>
//              D3: ${d.d3?.toFixed(3) ?? 'NA'}${(d.se_d3!=null && isFinite(d.se_d3)) ? ` ± ${(+d.se_d3).toFixed(3)}` : ''}<br/>
//              n: ${d.n_windows_used}${(d.denom_sum!=null)? `; denomΣ=${(d.denom_sum as number).toFixed(2)}` : ''}<br/>
//              p${(q===d.p_d3 ? '' : ' (FDR)')}: ${(+q).toExponential(2)}`
//           ); placeTip(e as MouseEvent);
//         })
//         .on('mouseleave', hideTip);

//       // Significant points (FDR): draw ring
//       const sig = d3Blocks.filter(b => (b.sig_d3 === true) || ((b as any).p_d3_fdr !== undefined && (b as any).p_d3_fdr < (this.data as any).params.alpha));
//       g.selectAll('circle.sig')
//         .data(sig).enter().append('circle')
//         .attr('class', 'sig')
//         .attr('cx', d => x(d.mid_BP)).attr('cy', d => y((d.d3 ?? 0)))
//         .attr('r', 6).attr('fill', 'none').attr('stroke', '#d95f02').attr('stroke-width', 1.5);

//       // Title
//       const gp = (this.data as any).global?.p_global;
//       g.append('text').attr('x', 0).attr('y', -TITLE_OFFSET).attr('font-weight', '600')
//         .text(`D3 scan (B=${(this.data as any).params.block_size}); global p=${(gp!=null)? (+gp).toExponential(2) : 'NA'}`);
//     } else {
//       // Unknown schema
//       g.append('text').attr('x', 0).attr('y', 0).text('Unrecognized data schema.');
//     }
//   }
// }

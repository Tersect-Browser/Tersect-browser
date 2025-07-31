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

  private getContainerWidth(el: HTMLElement): number {
    // Try multiple ways; fall back to window width if needed
    return el.clientWidth
        || el.getBoundingClientRect().width
        || el.parentElement?.clientWidth
        || Math.max(320, Math.floor(el.clientWidth * 0.9));
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
      const [px, py] = d3.pointer(e, el);
      tooltip.style('display', 'block')
        .style('left', `${px + 14}px`)
        .style('top', `${py + 14}px`)
        .html(
          `mid: ${(d.mid_BP/1e6).toFixed(2)} Mb<br/>
           obs: ${d.obs_disc_frac.toFixed(3)}<br/>
           exp: ${d.exp_disc_frac.toFixed(3)}<br/>
           n: ${d.n_trees} (T2=${d.count_T2}, T3=${d.count_T3})<br/>
           p_total(FDR): ${d.p_total_fdr.toExponential(2)}<br/>
           p_sym(FDR): ${d.p_sym_fdr.toExponential(2)}`
        );
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

// introgression-plot-view.component.ts
import { Component, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { IntrogressionService } from '../../services/introgression.service';
import { tap } from 'rxjs/operators';
import { Subscription } from 'rxjs';
import { PlotStateService } from '../tersect-distance-plot/services/plot-state.service';

@Component({
  selector: 'app-introgression-plot',
  templateUrl: './introgression-plot.component.html',
  styleUrls: ['./introgression-plot.component.css'],
})
export class IntrogressionPlotViewComponent {
  // Expose service observables directly to template

  loading = false;
    error = null;
    scanResponse = null;

  private sub = new Subscription();
  offsetCanvas: number;

  constructor(
    public introgression: IntrogressionService,
    private readonly plotState: PlotStateService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.sub.add(this.introgression.loading$.subscribe(v => {
      console.log('[plot-view] loading', v);
      this.loading = v;
      this.cdr.markForCheck();   // important with OnPush
    }));
    this.sub.add(this.introgression.error$.subscribe(v => {
      console.log('[plot-view] error', v);
      this.error = v;
      this.cdr.markForCheck();
    }));
    this.sub.add(this.introgression.scanResponse$.subscribe(v => {
      console.log('[plot-view] scanResponse', v);
      this.scanResponse = v;
      this.cdr.markForCheck();
    }));
    this.sub.add(this.plotState.offsetCanvas$.subscribe(value => {
    console.log('[plot-view] offsetCanvas', value);
      this.offsetCanvas = value;
    }));
  }
}

// introgression-plot-view.component.ts
import { Component, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { IntrogressionService } from '../../services/introgression.service';
import { tap } from 'rxjs/operators';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-introgression-plot',
  templateUrl: './introgression-plot.component.html',
  styleUrls: ['./introgression-plot.component.css'],
})
export class IntrogressionPlotViewComponent {
  // Expose service observables directly to template

  loading = false;
    error = null;
    plotUrl = null;

  private sub = new Subscription();

  constructor(
    public introgression: IntrogressionService,
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
    this.sub.add(this.introgression.plotUrl$.subscribe(v => {
      console.log('[plot-view] plotUrl', v);
      this.plotUrl = v;
      this.cdr.markForCheck();
    }));
  }
}

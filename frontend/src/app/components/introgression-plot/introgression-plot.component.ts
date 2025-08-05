// introgression-plot-view.component.ts
import { Component, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { IntrogressionQuery, IntrogressionService } from '../../services/introgression.service';
import { take, tap } from 'rxjs/operators';
import { Subscription } from 'rxjs';
import { PlotStateService } from '../tersect-distance-plot/services/plot-state.service';
import { TersectBackendService } from '../../services/tersect-backend.service';

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
showModal = false;
accessions: string[] = [];
scanPayload: IntrogressionQuery | null = null;
  private sub = new Subscription();
  offsetCanvas: number;

  constructor(
    public introgression: IntrogressionService,
    public tersectBackend: TersectBackendService,
    private readonly plotState: PlotStateService,
    private cdr: ChangeDetectorRef
  ) {
    this.startAnalysis = this.startAnalysis.bind(this);
    this.handleModalClosed = this.handleModalClosed.bind(this);
  }

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
    this.sub.add(this.plotState.accessions$.subscribe(value => {
      console.log('[plot-view] accessions', value);
      this.accessions = value;
      this.cdr.markForCheck();
    }));
    this.sub.add(this.introgression.scanPayload$.subscribe(value => {
      console.log('[plot-view] scanPayload', value);
      this.scanPayload = value;
      this.cdr.markForCheck();
    }));
    this.sub.add(this.introgression.showModal$.subscribe(value => {
      console.log('[plot-view] showModal', value);
      this.showModal = value;
      this.cdr.markForCheck();
    }));

  }
   async startAnalysis({outgroup, quartet, mpl}: {outgroup: string; quartet: string[]; mpl: string[]}) {
    console.log('Starting analysis with:', this.scanPayload);
    return this.introgression.searchForIntrogressions({
                            chromosome: this.scanPayload.chromosome,
                            interval: this.scanPayload.interval,
                            accessions: quartet,
                            datasetId: this.scanPayload.datasetId,
                            outgroup: outgroup,
                        }).pipe(take(1)).toPromise();
    }
    async handleModalClosed() {
        console.log('Modal closed');
        this.showModal = false;
        this.introgression.showModalSubject.next(false);

    // this.cdr.markForCheck();
    }
}

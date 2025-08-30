





// introgression.service.ts
import { Injectable, NgZone, Inject  } from '@angular/core';
import { BehaviorSubject, Observable, of, Subscription } from 'rxjs';
import { finalize, map, shareReplay, tap } from 'rxjs/operators';
import { TersectBackendService } from './tersect-backend.service';
import { APP_CONFIG, AppConfig } from '../app.config';


export interface IntrogressionQuery {
    chromosome: string;
    interval: [number, number];
    accessions: string[];
    wholeAccessions?: string[];
    datasetId: string;
    outgroup: string;
    blockSize?: number;
    maxReticulations?: number;
}

type Stage =
  | 'queued'
  | 'introgression-running'
  | 'phylonet-running'
  | 'done'
  | 'error';

type TersectEvent =
  | 'pipeline:start'
  | 'pipeline:progress'
  | 'introgression:result'
  | 'phylonet:result'
  | 'pipeline:done'
  | 'pipeline:error';

@Injectable({ providedIn: 'root' })
export class IntrogressionService {
  private loadingSubject = new BehaviorSubject<boolean>(false);
   private es: EventSource | null = null;
  private errorSubject = new BehaviorSubject<string | null>(null);
  private scanResponseSubject = new BehaviorSubject<string | null>(null);
  private scanPayloadSubject = new BehaviorSubject<IntrogressionQuery | null>(null);
   showModalSubject = new BehaviorSubject<boolean>(false);
  private stageSubject = new BehaviorSubject<Stage | null>(null);
   private target: Window | Element = window;


  loading$: Observable<boolean> = this.loadingSubject.asObservable();
  error$: Observable<string | null> = this.errorSubject.asObservable();
  scanResponse$: Observable<string | null> = this.scanResponseSubject.asObservable();
  scanPayload$: Observable<IntrogressionQuery | null> = this.scanPayloadSubject.asObservable();
  showModal$: Observable<boolean> = this.showModalSubject.asObservable();


  private activeSub: Subscription | null = null;

 private readonly apiUrl: string;

  constructor(private backend: TersectBackendService,  private zone: NgZone, @Inject(APP_CONFIG) config: AppConfig) {
    this.apiUrl = config.tbApiUrl;
  }

setTarget(el: Element | null) {
    if (el) this.target = el;
  }

  initiateScan(payload: IntrogressionQuery): void {
    this.scanPayloadSubject.next(payload);
    this.showModalSubject.next(true);
  }

  /** Called by the "trigger" component. Manages state internally. */
  searchForIntrogressions(payload: IntrogressionQuery) {
    // cancel any in-flight request

    if (this.activeSub) {
      this.activeSub.unsubscribe();
    }

    // reset state
    this.errorSubject.next(null);
    this.loadingSubject.next(true);

    // revoke previous URL if any
    const prev = this.scanResponseSubject.value;
    if (prev) {
      URL.revokeObjectURL(prev);
      this.scanResponseSubject.next(null);
    }

      // fire the request (no subscribe yet)
  const request$ = this.backend.searchForIntrogressions(payload).pipe(
    tap({
      next: (res) => {
        const datasetId = res.datasetId || payload.datasetId;
        console.log(res, 'from init stage');
          const accKey = res.accKey; // server should give this back
          if (!datasetId || !accKey) {
            throw new Error('Missing datasetId/accKey for SSE connection');
          }

          // 2) Open SSE stream
          this.openSseStream(datasetId, accKey);

      },
      error: (err) => {
        const msg = (err && err.message) || 'Failed to generate plot.';
        this.errorSubject.next(msg);
      }
    }),
    finalize(() => this.loadingSubject.next(false)),
    map(res => res),
    shareReplay(1)
  );

  // keep your side effects active (loading/error streams) if you need them
  this.activeSub = request$.subscribe();
  return request$;
  }

  /** Optional: clear current image & error (e.g., when changing dataset). */
  clear(): void {

  }
    private openSseStream(datasetId: string, accKey: string) {
    // Close any existing stream first
    this.closeStream();

    const url = `${this.apiUrl}/sse/${encodeURIComponent(datasetId)}/${encodeURIComponent(accKey)}`;

    // Run outside Angular to avoid excessive change detection; re-enter via zone.run
    this.zone.runOutsideAngular(() => {
      const es = new EventSource(url);

       const forward = (type: TersectEvent) => (evt: MessageEvent) => {
        let detail: any = evt.data;
        try { detail = JSON.parse(evt.data); } catch {}
        // Re-emit as browser event: "tersect:<type>"
        console.log('SSE event', type, detail), `tersect:${type}`;
        const ev = new CustomEvent(`tersect:${type}`, { detail });
        // dispatch on chosen target
        (this.target as any).dispatchEvent(ev);
      };

    ['pipeline:start','pipeline:progress','introgression:result','phylonet:result','pipeline:done','pipeline:error']
        .forEach((t) => es.addEventListener(t as TersectEvent, forward(t as TersectEvent)));


      es.onerror = (_e) => {
        // Browser will auto-retry if server sends `retry: N`—still surface a soft error
        this.zone.run(() => this.errorSubject.next(null)); // avoid noisy UI; keep silent by default
         const ev = new CustomEvent('tersect:error', { detail: { message: 'sse error' } });
        (this.target as any).dispatchEvent(ev);
      };

      this.es = es;
    });
  }

    closeStream(): void {
    try { this.es.close(); } catch {}
    this.es = null;
  }
}

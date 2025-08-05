





// introgression.service.ts
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of, Subscription } from 'rxjs';
import { finalize, map, shareReplay, tap } from 'rxjs/operators';
import { TersectBackendService } from './tersect-backend.service';

export interface IntrogressionQuery {
    chromosome: string;
    interval: [number, number];
    accessions: string[];
    datasetId: string;
    outgroup: string;
}

@Injectable({ providedIn: 'root' })
export class IntrogressionService {
  private loadingSubject = new BehaviorSubject<boolean>(false);
  private errorSubject = new BehaviorSubject<string | null>(null);
  private scanResponseSubject = new BehaviorSubject<string | null>(null);
  private scanPayloadSubject = new BehaviorSubject<IntrogressionQuery | null>(null);
   showModalSubject = new BehaviorSubject<boolean>(false);

  loading$: Observable<boolean> = this.loadingSubject.asObservable();
  error$: Observable<string | null> = this.errorSubject.asObservable();
  scanResponse$: Observable<string | null> = this.scanResponseSubject.asObservable();
  scanPayload$: Observable<IntrogressionQuery | null> = this.scanPayloadSubject.asObservable();
  showModal$: Observable<boolean> = this.showModalSubject.asObservable();


  private activeSub: Subscription | null = null;

  constructor(private backend: TersectBackendService) {}

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
        const data = res.data;
        this.scanResponseSubject.next(data);
      },
      error: (err) => {
        const msg = (err && err.message) || 'Failed to generate plot.';
        this.errorSubject.next(msg);
      }
    }),
    finalize(() => this.loadingSubject.next(false)),
    map(res => res),      // <-- return the data to the caller
    shareReplay(1)             // optional: in case multiple listeners attach
  );

  // keep your side effects active (loading/error streams) if you need them
  this.activeSub = request$.subscribe();
  return request$;
  }

  /** Optional: clear current image & error (e.g., when changing dataset). */
  clear(): void {
    // this.activeSub?.unsubscribe();
    // const prev = this.scanResponseSubject.value;
    // if (prev) URL.revokeObjectURL(prev);
    // this.scanResponseSubject.next(null);
    // this.errorSubject.next(null);
    // this.loadingSubject.next(false);
  }
}

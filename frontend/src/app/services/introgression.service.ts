





// introgression.service.ts
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of, Subscription } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { TersectBackendService } from './tersect-backend.service';

interface IntrogressionQuery {
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

  loading$: Observable<boolean> = this.loadingSubject.asObservable();
  error$: Observable<string | null> = this.errorSubject.asObservable();
  scanResponse$: Observable<string | null> = this.scanResponseSubject.asObservable();

  private activeSub: Subscription | null = null;

  constructor(private backend: TersectBackendService) {}

  /** Called by the "trigger" component. Manages state internally. */
  searchForIntrogressions(payload: IntrogressionQuery): void {
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

    this.activeSub = this.backend.searchForIntrogressions(payload).pipe(
      finalize(() => this.loadingSubject.next(false))
    ).subscribe({
      next: (res) => {
        console.log('Introgression plot received:', res );
        const data = res.data;
        this.scanResponseSubject.next(data);
      },
      error: (err) => {
        const msg = (err && err.message) || 'Failed to generate plot.';
        this.errorSubject.next(msg);
      }
    });
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

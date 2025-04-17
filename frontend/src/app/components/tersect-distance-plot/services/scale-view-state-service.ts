// scale-view-state.service.ts
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { ScaleView } from '../../../models/ScaleView';


@Injectable({
  providedIn: 'root'
})
export class ScaleViewStateService {
  private scaleViewSubject = new BehaviorSubject<ScaleView | null>(null);

  // Observable for components to subscribe
  scaleView$: Observable<ScaleView | null> = this.scaleViewSubject.asObservable();

  // Method to update ScaleView
  updateScaleView(scaleView: ScaleView): void {
    this.scaleViewSubject.next(scaleView);
  }

  // Optional: get current value without subscribing
  get currentScaleView(): ScaleView | null {
    return this.scaleViewSubject.value;
  }
}

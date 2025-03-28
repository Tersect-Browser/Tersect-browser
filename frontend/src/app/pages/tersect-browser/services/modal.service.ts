import { Injectable, Type } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface CustomElementModalConfig {
  tagName: string;
  props?: any;
  title?: string;
}

@Injectable({ providedIn: 'root' })
export class ModalService {
  private modalVisible$ = new BehaviorSubject<boolean>(false);
  private modalTitle$ = new BehaviorSubject<string>('Modal');
  private customElementConfig$ = new BehaviorSubject<CustomElementModalConfig | null>(null);

  visible$ = this.modalVisible$.asObservable();
  title$ = this.modalTitle$.asObservable();
  customElement$ = this.customElementConfig$.asObservable();

  openElementModal(config: CustomElementModalConfig) {
    this.customElementConfig$.next(config);
    this.modalTitle$.next(config.title || 'Modal');
    this.modalVisible$.next(true);
  }

  closeModal() {
    this.modalVisible$.next(false);
    this.customElementConfig$.next(null);
  }
}
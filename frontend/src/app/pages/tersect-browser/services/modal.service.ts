import { Injectable, Type } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ModalService {
  private modalVisible$ = new BehaviorSubject<boolean>(false);
  private modalComponent$ = new BehaviorSubject<Type<any> | null>(null);
  private modalTitle$ = new BehaviorSubject<string>('Modal');

  visible$ = this.modalVisible$.asObservable();
  component$ = this.modalComponent$.asObservable();
  title$ = this.modalTitle$.asObservable();

  openComponentModal(component: Type<any>, title: string = 'Modal') {
    this.modalComponent$.next(component);
    this.modalTitle$.next(title);
    this.modalVisible$.next(true);
  }

  closeModal() {
    this.modalVisible$.next(false);
  }
}

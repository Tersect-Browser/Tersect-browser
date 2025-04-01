import { Injectable, Type } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { JbrowseWrapperProps } from '../../../../../../common/JbrowseInterface'



@Injectable({ providedIn: 'root' })
export class ModalService {
  private modalVisible$ = new BehaviorSubject<boolean>(false);
  private modalTitle$ = new BehaviorSubject<string>('Modal');
  private modalProps$ = new BehaviorSubject<JbrowseWrapperProps | null>(null);

  visible$ = this.modalVisible$.asObservable();
  title$ = this.modalTitle$.asObservable();
  customElement$ = this.modalProps$.asObservable();

  openElementModal(config: JbrowseWrapperProps) {
    this.modalVisible$.next(true);
    this.modalProps$.next(config);
    this.modalTitle$.next('JBrowse');
  }

  closeModal() {
    this.modalVisible$.next(false);
    this.modalProps$.next(null);
  }
}
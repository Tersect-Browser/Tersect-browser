import { Injectable, Type } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { JbrowseWrapperProps } from '../../../../../../common/JbrowseInterface'



@Injectable({ providedIn: 'root' })
export class ModalService {
  private modalVisible$ = new BehaviorSubject<boolean>(false);
  private modalTitle$ = new BehaviorSubject<string>('Modal');
  private modalProps$ = new BehaviorSubject<JbrowseWrapperProps | null>(null);
  private barcodeVisible$ = new BehaviorSubject<boolean>(false);
  private barcodeTitle$ = new BehaviorSubject<string>('Barcode');
  private barcodeChromo$ = new BehaviorSubject<string>('');
  private barcodeStart$ = new BehaviorSubject<number>(0);
  private barcodeEnd$ = new BehaviorSubject<number>(0);

  visible$ = this.modalVisible$.asObservable();
  title$ = this.modalTitle$.asObservable();
  customElement$ = this.modalProps$.asObservable();
  barcode$ = this.barcodeVisible$.asObservable();
  barcodeTit$ = this.barcodeTitle$.asObservable();
  chrom$ = this.barcodeChromo$.asObservable();
  start$ = this.barcodeStart$.asObservable();
  end$ = this.barcodeEnd$.asObservable();

  openElementModal(config: JbrowseWrapperProps) {
    this.modalVisible$.next(true);
    this.modalProps$.next(config);
    this.modalTitle$.next(config.location.accession.name);
  }

  closeModal() {
    this.modalVisible$.next(false);
    this.modalProps$.next(null);
  }

  openBarcodeModal(accessionName, chrom, startPosition, endPosition){
    this.barcodeVisible$.next(true);
    this.barcodeTitle$.next(accessionName);
    this.barcodeChromo$.next(chrom);
    this.barcodeStart$.next(startPosition);
    this.barcodeEnd$.next(endPosition);
  }

  closeBarcodeModal(){
    this.barcodeVisible$.next(false);
  }
}
import { Component, ViewChild, ElementRef, OnInit } from '@angular/core';
import { ModalService } from '../../pages/tersect-browser/services/modal.service';
import { JbrowseWrapperProps } from '../../../../../common/JbrowseInterface';
import { TersectBackendService } from '../../services/tersect-backend.service';



@Component({
  selector: 'app-global-barcode',
  templateUrl: './global-barcode.component.html',
  styleUrls: ['./global-barcode.component.css']
})
export class GlobalBarcodeComponent implements OnInit {
  isVisible: boolean = false;
  modalTitle: string = 'Barcode Modal';

  barcodeSize: number = 150;

  // jbrowseProps: JbrowseWrapperProps = {
  //   location: {
  //     start: 0,
  //     end: 98543444,
  //     zoomLevel: 100,
  //     pheneticWidth: 1000,
  //     binSize: 50000
  //   }
  // };

  @ViewChild('customElementContainer', { static: true }) containerRef!: ElementRef;

  constructor(public modalService: ModalService,
    private readonly tersectBackendService: TersectBackendService
  ) {}

  ngOnInit() {
    this.modalService.barcode$.subscribe(val => this.isVisible = val);
    this.modalService.barcodeTit$.subscribe(title => {
      console.log('title', title);
      this.modalTitle = title
    });



    // this.modalService.customElement$.subscribe(config => {

    //   this.jbrowseProps = config;
    //   if(config) {
    //     if (config.location) {
    //       if (config.location.accession) {
    //         if (config.location.accession.name) {
    //           this.modalTitle = config.location.accession.name;
    //         }
    //       }
    //     }
    //   }
    // });
    
  }
  generateBarcode(){
    console.log('Barcode size entered:', this.barcodeSize);
      this.tersectBackendService.generateBarcodes('acc1', 'chr1', 0, 10000, 200)
  .subscribe(blob => {
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.download = 'barcodes.txt';
    link.click();
  });
  }

}

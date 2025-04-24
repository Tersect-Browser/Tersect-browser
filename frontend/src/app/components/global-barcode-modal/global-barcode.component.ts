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
  chromosome: string;
  startPosition: number;
  endPosition: number;

  downloadLink: string;

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
    this.modalService.chrom$.subscribe(chrom => {
      this.chromosome = chrom
    });
    this.modalService.start$.subscribe(val => {
      this.startPosition = val
    });
    this.modalService.end$.subscribe(val => {
      this.endPosition = val
    })
    
  }
  generateBarcode(){
    console.log('Barcode size entered:', this.barcodeSize);
    console.log('Accession', this.modalTitle);
    console.log('chrom', this.chromosome);
    console.log('start', this.startPosition);
    console.log('end', this.endPosition);

      this.tersectBackendService.generateBarcodes(this.modalTitle, this.chromosome, this.startPosition, this.endPosition, this.barcodeSize)
  .subscribe(blob => {
    console.log(blob, 'blob---')
    // const link = document.createElement('a');
    // link.href = window.URL.createObjectURL(blob);
    // link.download = 'barcodes.txt';
    // link.click();
  });
  }
  // grab object and extract url and return url to server 
  // set barcode to anchor link and set attribute to download
  // <a href="path_to_file" download="proposed_file_name">Download</a>
  // http://127.0.0.1:4300/TersectBrowserGP/datafiles/trix_indices/

  // here have attribite with download link --> will then set this with downloadable link
}

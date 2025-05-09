import { Component, ViewChild, ElementRef, OnInit } from '@angular/core';
import { ModalService } from '../../pages/tersect-browser/services/modal.service';
import { JbrowseWrapperProps } from '../../../../../common/JbrowseInterface';
import { TersectBackendService } from '../../services/tersect-backend.service';
import { ActivatedRoute } from '@angular/router';
import { take } from 'rxjs/operators';

import { PlotStateService } from '../tersect-distance-plot/services/plot-state.service';
import { isNullOrUndefined } from '../../utils/utils';



@Component({
  selector: 'app-global-barcode',
  templateUrl: './global-barcode.component.html',
  styleUrls: ['./global-barcode.component.css'],
  providers: [PlotStateService]
})
export class GlobalBarcodeComponent implements OnInit {
  isVisible: boolean = false;
  isLoading: boolean = false;
  modalTitle: string = 'Barcode Modal';

  barcodeSize: number = 150;
  chromosome: string;
  startPosition: number;
  endPosition: number;
  maxVariants: number | null = 1;

  downloadLink: string;
  datasetId: string;

  downloadUrl: string | null = null;
  downloadFileName: string = '';

  @ViewChild('customElementContainer', { static: true }) containerRef!: ElementRef;

  constructor(public modalService: ModalService,
    private readonly tersectBackendService: TersectBackendService,
    private readonly route: ActivatedRoute,
    private readonly plotState: PlotStateService,
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


  //  <a href="link.href" download="link.download">Download</a>

  resetModal(): void {
    console.log('reset modal called')
    this.barcodeSize = 150;
    this.maxVariants = 1;
    this.downloadUrl = null;
    this.downloadFileName = '';
    this.isLoading = false;
  }
  
  async generateBarcode() {
    this.isLoading = true;

  
    this.tersectBackendService.generateBarcodes(
      this.modalTitle,
      this.chromosome,
      this.startPosition,
      this.endPosition,
      this.barcodeSize,
      this.maxVariants,
      this.plotState.datasetId || "Example dataset"
    ).subscribe({
      next: (response) => {

        const fileUrl = response.downloadableURL;
        const fileName = fileUrl.substring(fileUrl.lastIndexOf('/') + 1);

        this.downloadUrl = fileUrl;
        this.downloadFileName = fileName;
      },
      error: (err) => {
        console.error('Error generating barcode:', err);
      },
      complete: () => {
        this.isLoading = false;
        console.log('loading status - finished', this.isLoading)
        this.maxVariants = 1;
        this.barcodeSize = 150;
      }

     

    });
  }
}

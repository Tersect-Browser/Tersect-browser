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
  isLoading: boolean = false;
  modalTitle: string = 'Barcode Modal';

  barcodeSize: number = 150;
  chromosome: string;
  startPosition: number;
  endPosition: number;
  maxVariants: number | null = null;

  downloadLink: string;

  downloadUrl: string | null = null;
  downloadFileName: string = '';

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


  //  <a href="link.href" download="link.download">Download</a>

  resetModal(): void {
    console.log('reset modal called')
    this.barcodeSize = 150;
    this.maxVariants = null;
    this.downloadUrl = null;
    this.downloadFileName = '';
    this.isLoading = false;
  }
  
  generateBarcode() {
    this.isLoading = true;
    console.log('loading status - start', this.isLoading)
    console.log('Barcode size entered:', this.barcodeSize);
    console.log('Accession', this.modalTitle);
    console.log('chrom', this.chromosome);
    console.log('start', this.startPosition);
    console.log('end', this.endPosition);
  
    this.tersectBackendService.generateBarcodes(
      this.modalTitle,
      this.chromosome,
      this.startPosition,
      this.endPosition,
      this.barcodeSize,
      this.maxVariants
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
        this.maxVariants = null;
        this.barcodeSize = 150;
      }

      /**
       * FROM HERE KEEP - JUST TRYING OUT OTHER STUFF
       */
      // const fileUrl = response.downloadableURL;
      // const fileName = fileUrl.substring(fileUrl.lastIndexOf('/') + 1);
  
      // // Store the values so the download button in the template can use them
      // this.downloadUrl = fileUrl;
      // this.downloadFileName = fileName;
  
      /**
       * TO HERE WORKS!! KEEP - JUST TRYING OUT OTHER STUFF
       */
      /////// can keep commented
      // OPTIONAL: Automatically trigger download
      // this.autoDownload(fileUrl, fileName);

      ///// another test
      // const fileUrl = response.downloadableURL;

      //       // Extract the filename from the URL
      //       const fileName = fileUrl.substring(fileUrl.lastIndexOf('/') + 1);

      //       // Create a temporary <a> tag to simulate the download action
      //       const link = document.createElement('a');
      //       link.href = fileUrl;
      //       link.download = fileName; // Set the filename for download

      //       // Trigger the download
      //       document.body.appendChild(link);
      //       link.click();

      //       // Clean up
      //       document.body.removeChild(link);

    });
  }
}

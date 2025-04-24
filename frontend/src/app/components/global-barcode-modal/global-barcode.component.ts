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

  downloadUrl: string | null = null;
  downloadFileName: string = '';

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
  // generateBarcode(){
  //   console.log('Barcode size entered:', this.barcodeSize);
  //   console.log('Accession', this.modalTitle);
  //   console.log('chrom', this.chromosome);
  //   console.log('start', this.startPosition);
  //   console.log('end', this.endPosition);

  //     this.tersectBackendService.generateBarcodes(this.modalTitle, this.chromosome, this.startPosition, this.endPosition, this.barcodeSize)
  // .subscribe(response => {
  //   const fileUrl = response.downloadableURL;
  //   // Extract filename from URL
  //   const fileName = fileUrl.substring(fileUrl.lastIndexOf('/') + 1);

  //   // Create a temporary anchor to trigger download
  //   const link = document.createElement('a');
  //   link.href = fileUrl;
  //   link.download = fileName;

  //   document.body.appendChild(link);
  //   link.click();

  //   // Clean up
  //   document.body.removeChild(link);
  //   // console.log(blob, 'blob---')
  //   // const link = document.createElement('a');
  //   // link.href = window.URL.createObjectURL(blob);
  //   // link.download = 'barcodes.txt';
  //   // link.click();
  // });
  // }
  // grab object and extract url and return url to server 
  // set barcode to anchor link and set attribute to download
  // <a href="path_to_file" download="proposed_file_name">Download</a>
  // http://127.0.0.1:4300/TersectBrowserGP/datafiles/trix_indices/

  // here have attribite with download link --> will then set this with downloadable link

  //  <a href="link.href" download="link.download">Download</a>

  generateBarcode() {
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
      this.barcodeSize
    ).subscribe(response => {
      ////// test1
      const fileUrl = response.downloadableURL;
      const fileName = fileUrl.substring(fileUrl.lastIndexOf('/') + 1);
  
      // Store the values so the download button in the template can use them
      this.downloadUrl = fileUrl;
      this.downloadFileName = fileName;
  
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
    
    /////// at the very least, open a new tab!!
    // const fileUrl = response.downloadableURL;  // The URL returned from the backend

    // // Open the file in a new tab
    // const newTab = window.open(fileUrl, '_blank');
    
    // // If the new tab was blocked by a pop-up blocker, notify the user
    // if (!newTab) {
    //     alert('Pop-up blocked. Please allow pop-ups for this site.');
    // }

    });
  }
}

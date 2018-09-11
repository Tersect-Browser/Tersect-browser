import { Component, OnInit, ViewChild, ElementRef, HostListener } from '@angular/core';
import { GreyscalePalette, RedPalette } from './DistancePalette';
import { TersectBackendService } from '../services/tersect-backend.service';

@Component({
  selector: 'app-introgression-plot',
  templateUrl: './introgression-plot.component.html',
  styleUrls: ['./introgression-plot.component.css']
})
export class IntrogressionPlotComponent implements OnInit {
  @ViewChild('plotCanvas') canvasRef: ElementRef;

  private distance_table = {};

  constructor(private tersectBackendService: TersectBackendService) { }

  drawPlot() {
    /*this.canvasRef.nativeElement.style.width = '100%';
    this.canvasRef.nativeElement.style.height = '100%';*/
    this.canvasRef.nativeElement.width = this.canvasRef.nativeElement
                                             .parentElement.parentElement
                                             .offsetWidth;
    this.canvasRef.nativeElement.height = this.canvasRef.nativeElement
                                              .parentElement.parentElement
                                              .offsetHeight;
    const ctx: CanvasRenderingContext2D = this.canvasRef
                                              .nativeElement
                                              .getContext('2d');
    const palette = new GreyscalePalette(ctx);
    Object.keys(this.distance_table).forEach((accession, accession_index) => {
      palette.distanceToColors(this.distance_table[accession])
             .forEach((color, bin_index) => {
        ctx.putImageData(color, bin_index, accession_index);
      });
    });
  }

  ngOnInit() {
    this.tersectBackendService.getDistances('TS-99.vcf', 'SL2.50ch01', 1, 100000000, 10000).subscribe(distances => {
      this.distance_table = distances;
      this.drawPlot();
    });
  }

  @HostListener('window:resize', ['$event'])
  onResize(event) {
    this.drawPlot();
  }

}

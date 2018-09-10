import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';

@Component({
  selector: 'app-introgression-plot',
  templateUrl: './introgression-plot.component.html',
  styleUrls: ['./introgression-plot.component.css']
})
export class IntrogressionPlotComponent implements OnInit {
  @ViewChild('plotCanvas') canvasRef: ElementRef;

  constructor() { }

  ngOnInit() {
    // this.canvasRef.nativeElement.style.width = '100%';
    // this.canvasRef.nativeElement.style.height = '100%';
    /*console.log(this.canvasRef.nativeElement.parentElement.clientWidth);
    this.canvasRef.nativeElement.width = this.canvasRef.nativeElement.parentElement.width;
    this.canvasRef.nativeElement.height = 300;*/

    const ctx: CanvasRenderingContext2D = this.canvasRef
                                              .nativeElement
                                              .getContext('2d');

    const img: ImageData = ctx.createImageData(1, 1);
    img.data[0] = 255;
    img.data[1] = 0;
    img.data[2] = 0;
    img.data[3] = 255;
    for (let i = 0; i < 444; i++) {
      for (let j = 0; j < 100000000 / 1000; j++) {
        if (Math.random() > 0.8) {
          ctx.putImageData(img, j, i);
        }
      }
    }
    /*const pixels: any[] = [];
    for (let i = 0; i < 444; i++) {
      for (let j = 0; j < 500; j++) {
        pixels.push({
          x: i,
          y: j,
          // tslint:disable-next-line:no-bitwise
          r: Math.random() * 255 << 0,
          // tslint:disable-next-line:no-bitwise
          g: Math.random() * 255 << 0,
          // tslint:disable-next-line:no-bitwise
          b: Math.random() * 255 << 0,
          // tslint:disable-next-line:no-bitwise
          a: Math.random() * 128 << 0 + 128
        });
      }
    }
    for (const px of pixels) {
      ctx.putImageData(px, px.x, px.y);
    }*/
  }
}

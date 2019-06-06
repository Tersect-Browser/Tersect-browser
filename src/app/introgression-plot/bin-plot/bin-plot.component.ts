import { Component, ViewChild, ElementRef, Output, EventEmitter } from '@angular/core';
import { IntrogressionPlotService } from '../../services/introgression-plot.service';
import { isNullOrUndefined } from 'util';
import { PlotClickEvent, PlotHoverEvent } from '../../models/PlotPosition';

@Component({
    selector: 'app-bin-plot',
    templateUrl: './bin-plot.component.html',
    styleUrls: ['./bin-plot.component.css']
})

export class BinPlotComponent {
    @ViewChild('canvas') canvas: ElementRef;

    /**
     * Emitted when bins are clicked.
     */
    @Output() binClick = new EventEmitter<PlotClickEvent>();

    /**
     * Emitted when mouse hovers over a bin.
     */
    @Output() binHover = new EventEmitter<PlotHoverEvent>();

    get gui_margins() {
        return this.plotService.gui_margins;
    }

    constructor(private plotService: IntrogressionPlotService) {}

    draw() {
        if (isNullOrUndefined(this.plotService.plot_array)) { return; }

        this.canvas.nativeElement
                   .style.width = `${this.plotService.zoom_level}%`;
        this.canvas.nativeElement
                   .style.height = `${this.plotService.zoom_level
                                      / this.plotService.aspect_ratio}%`;

        this.canvas.nativeElement.width = this.canvas.nativeElement
                                                     .parentElement
                                                     .parentElement
                                                     .parentElement
                                                     .offsetWidth;
        this.canvas.nativeElement.height = this.canvas.nativeElement
                                                      .parentElement
                                                      .parentElement
                                                      .parentElement
                                                      .offsetHeight;

        const ctx: CanvasRenderingContext2D = this.canvas.nativeElement
                                                         .getContext('2d');
        ctx.clearRect(0, 0, this.canvas.nativeElement.width,
                      this.canvas.nativeElement.height);
        ctx.putImageData(new ImageData(this.plotService.plot_array,
                                       this.plotService.col_num,
                                       this.plotService.row_num),
                         this.plotService.plot_position.x + this.plotService
                                                                .gui_margins
                                                                .left,
                         this.plotService.plot_position.y);
    }
}

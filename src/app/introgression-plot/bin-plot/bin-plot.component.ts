import { IntrogressionPlotService } from '../services/introgression-plot.service';
import { PlotPosition, PlotArea, PlotBin } from '../../models/PlotPosition';
import { CanvasPlotElement, DragState } from '../CanvasPlotElement';
import { PlotStateService } from '../services/plot-state.service';

import { Component, ViewChild, ElementRef } from '@angular/core';
import { isNullOrUndefined } from '../../utils/utils';

@Component({
    selector: 'app-bin-plot',
    templateUrl: './bin-plot.component.html',
    styleUrls: ['./bin-plot.component.css']
})
export class BinPlotComponent extends CanvasPlotElement {
    @ViewChild('canvas', { static: true })
    private canvas: ElementRef;
    @ViewChild('highlight', { static: true })
    private highlight: ElementRef;

    /**
     * Drag start position in terms of the accession / bin index.
     */
    private dragStartIndices = { x: 0, y: 0 };

    get guiMargins() {
        return this.plotService.gui_margins;
    }

    constructor(private plotState: PlotStateService,
                private plotService: IntrogressionPlotService) { super(); }

    private extractVisibleImage(): ImageData {
        const fullArray = this.plotService.plot_array;
        const pos = this.plotService.plot_position;
        const colNum = this.plotService.col_num;

        let visibleCols = Math.ceil(this.canvas.nativeElement.width
                                    / this.plotService.bin_width)
                          - this.plotService.gui_margins.left;
        if (visibleCols > colNum + pos.x) {
            // More visible area than available columns
            visibleCols = colNum + pos.x;
            if (visibleCols < 1) {
                visibleCols = 1;
            }
        }

        const visibleRows = Math.ceil(this.canvas.nativeElement.height
                                      / this.plotService.bin_height);

        const visibleArray = new Uint8ClampedArray(4 * visibleRows
                                                   * visibleCols);

        for (let i = 0; i < visibleRows; i++) {
            const rowStart = 4 * (colNum * (i - pos.y) - pos.x);
            visibleArray.set(fullArray.slice(rowStart,
                                             rowStart + 4 * visibleCols),
                             4 * i * visibleCols);
        }
        return new ImageData(visibleArray, visibleCols, visibleRows);
    }

    draw() {
        if (isNullOrUndefined(this.plotService.plot_array)) { return; }

        this.canvas.nativeElement
                   .style.width = `${this.plotState.zoom_level}%`;
        this.canvas.nativeElement
                   .style.height = `${this.plotState.zoom_level
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
        ctx.putImageData(this.extractVisibleImage(),
                         this.plotService.gui_margins.left,
                         0);
        this.updateHighlight();
    }

    private updateHighlight() {
        if (isNullOrUndefined(this.plotService.highlight)) {
            this.highlight.nativeElement.style.visibility = 'hidden';
        } else {
            const bpPerPixel = this.plotState.binsize
                               / this.plotService.zoom_factor;
            const plotOffset = this.plotService.gui_margins.left
                               + this.plotService.plot_position.x;

            const leftPos = (this.plotService.highlight.start
                             - this.plotState.interval[0]) / bpPerPixel
                            + plotOffset * this.plotService.bin_width;

            const width = (this.plotService.highlight.end
                           - this.plotService.highlight.start + 1)
                          / bpPerPixel;

            this.highlight.nativeElement.style.left = `${leftPos}px`;
            this.highlight.nativeElement.style.width = `${width}px`;
            this.highlight.nativeElement.style.visibility = 'visible';
        }
    }

    protected getPositionTarget(mousePosition: PlotPosition): PlotArea {
        if ([this.plotState.sorted_accessions,
             this.plotState.interval,
             this.plotState.binsize].some(isNullOrUndefined)) {
            return { type: 'background' };
        }
        const binIndex = Math.floor(mousePosition.x
                                    / this.plotService.bin_width)
                         - this.plotService.gui_margins.left
                         - this.plotService.plot_position.x;
        const accessionIndex = Math.floor(mousePosition.y
                                          / this.plotService.bin_height)
                               - this.plotService.plot_position.y;

        if (binIndex >= this.plotService.col_num
            || accessionIndex >= this.plotService.row_num) {
            return { type: 'background' };
        }

        const interval = this.plotState.interval;
        const binsize = this.plotState.binsize;

        const accession = this.plotState.sorted_accessions[accessionIndex];

        const result: PlotBin = {
            type: 'bin',
            accession_label: this.plotService.getAccessionLabel(accession),
            accession: accession,
            start_position: interval[0] + binIndex * binsize,
            end_position: interval[0] + (binIndex + 1) * binsize - 1
        };
        return result;
    }

    protected dragStartAction(dragState: DragState): void {
        // Dragging 'rounded' to accession / bin indices.
        this.dragStartIndices = {
            x: dragState.start_position.x / this.plotService.bin_width
                - this.plotService.plot_position.x,
            y: dragState.start_position.y / this.plotService.bin_height
                - this.plotService.plot_position.y
        };
    }

    protected dragStopAction(dragState: DragState): void {
        // No action
    }

    protected dragAction(dragState: DragState): void {
        // Dragging 'rounded' to accession / bin indices.
        const newPos: PlotPosition = {
            x: Math.round(dragState.current_position.x
                          / this.plotService.bin_width
                          - this.dragStartIndices.x),
            y: Math.round(dragState.current_position.y
                          / this.plotService.bin_height
                          - this.dragStartIndices.y)
        };

        if (newPos.x > 0) {
            newPos.x = 0;
        }
        if (newPos.y > 0) {
            newPos.y = 0;
        }

        this.plotService.updatePosition(newPos);
    }
}

import { Component, ElementRef, ViewChild } from '@angular/core';

import {
    PlotArea,
    PlotBin,
    PlotPosition
} from '../../models/PlotPosition';
import {
    isNullOrUndefined
} from '../../utils/utils';
import {
    CanvasPlotElement,
    DragState
} from '../CanvasPlotElement';
import {
    IntrogressionPlotService
} from '../services/introgression-plot.service';
import {
    PlotStateService
} from '../services/plot-state.service';

@Component({
    selector: 'app-bin-plot',
    templateUrl: './bin-plot.component.html',
    styleUrls: ['./bin-plot.component.css']
})
export class BinPlotComponent extends CanvasPlotElement {
    @ViewChild('canvas', { static: true })
    private readonly canvas: ElementRef;

    @ViewChild('highlight', { static: true })
    private readonly highlight: ElementRef;

    /**
     * Drag start position in terms of the accession / bin index.
     */
    private dragStartIndices = { x: 0, y: 0 };

    constructor(private readonly plotState: PlotStateService,
                private readonly plotService: IntrogressionPlotService) {
        super();
    }

    get guiMargins() {
        return this.plotService.guiMargins;
    }

    draw() {
        if (isNullOrUndefined(this.plotService.plotArray)) { return; }

        this.canvas.nativeElement
                   .style.width = `${this.plotState.zoomLevel}%`;
        this.canvas.nativeElement
                   .style.height = `${this.plotState.zoomLevel
                                      / this.plotService.aspectRatio}%`;

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
                         this.plotService.guiMargins.left,
                         0);
        this.updateHighlight();
    }

    protected dragAction(dragState: DragState): void {
        // Dragging 'rounded' to accession / bin indices.
        const newPos: PlotPosition = {
            x: Math.round(dragState.currentPosition.x
                          / this.plotService.binWidth
                          - this.dragStartIndices.x),
            y: Math.round(dragState.currentPosition.y
                          / this.plotService.binHeight
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

    protected dragStartAction(dragState: DragState): void {
        // Dragging 'rounded' to accession / bin indices.
        this.dragStartIndices = {
            x: dragState.startPosition.x / this.plotService.binWidth
               - this.plotService.plotPosition.x,
            y: dragState.startPosition.y / this.plotService.binHeight
               - this.plotService.plotPosition.y
        };
    }

    protected dragStopAction(dragState: DragState): void {
        // No action
    }

    protected getPositionTarget(mousePosition: PlotPosition): PlotArea {
        if ([this.plotState.sortedAccessions,
             this.plotState.interval,
             this.plotState.binsize].some(isNullOrUndefined)) {
            return { type: 'background' };
        }
        const binIndex = Math.floor(mousePosition.x
                                    / this.plotService.binWidth)
                         - this.plotService.guiMargins.left
                         - this.plotService.plotPosition.x;
        const accessionIndex = Math.floor(mousePosition.y
                                          / this.plotService.binHeight)
                               - this.plotService.plotPosition.y;

        if (binIndex >= this.plotService.colNum
            || accessionIndex >= this.plotService.rowNum) {
            return { type: 'background' };
        }

        const interval = this.plotState.interval;
        const binsize = this.plotState.binsize;

        const accession = this.plotState.sortedAccessions[accessionIndex];

        const result: PlotBin = {
            type: 'bin',
            accessionLabel: this.plotService.getAccessionLabel(accession),
            accession: accession,
            startPosition: interval[0] + binIndex * binsize,
            endPosition: interval[0] + (binIndex + 1) * binsize - 1
        };
        return result;
    }

    private extractVisibleImage(): ImageData {
        const fullArray = this.plotService.plotArray;
        const pos = this.plotService.plotPosition;
        const colNum = this.plotService.colNum;

        let visibleCols = Math.ceil(this.canvas.nativeElement.width
                                    / this.plotService.binWidth)
                          - this.plotService.guiMargins.left;
        if (visibleCols > colNum + pos.x) {
            // More visible area than available columns
            visibleCols = colNum + pos.x;
            if (visibleCols < 1) {
                visibleCols = 1;
            }
        }

        const visibleRows = Math.ceil(this.canvas.nativeElement.height
                                      / this.plotService.binHeight);

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

    private updateHighlight() {
        if (isNullOrUndefined(this.plotService.highlight)) {
            this.highlight.nativeElement.style.visibility = 'hidden';
        } else {
            const bpPerPixel = this.plotState.binsize
                               / this.plotService.zoomFactor;
            const plotOffset = this.plotService.guiMargins.left
                               + this.plotService.plotPosition.x;

            const leftPos = (this.plotService.highlight.start
                             - this.plotState.interval[0]) / bpPerPixel
                            + plotOffset * this.plotService.binWidth;

            const width = (this.plotService.highlight.end
                           - this.plotService.highlight.start + 1)
                          / bpPerPixel;

            this.highlight.nativeElement.style.left = `${leftPos}px`;
            this.highlight.nativeElement.style.width = `${width}px`;
            this.highlight.nativeElement.style.visibility = 'visible';
        }
    }
}

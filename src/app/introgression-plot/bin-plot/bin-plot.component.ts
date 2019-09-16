import { Component, ElementRef, ViewChild } from '@angular/core';

import {
    PlotArea,
    PlotBin,
    Position
} from '../../models/Plot';
import {
    isNullOrUndefined
} from '../../utils/utils';
import {
    CanvasPlotElement,
    DragState
} from '../CanvasPlotElement';
import {
    ContainerSize
} from '../introgression-plot.component';
import {
    BinDrawService
} from '../services/bin-draw.service';
import {
    IntrogressionPlotService
} from '../services/introgression-plot.service';
import {
    PlotStateService
} from '../services/plot-state.service';

@Component({
    selector: 'app-bin-plot',
    templateUrl: './bin-plot.component.html',
    styleUrls: ['./bin-plot.component.css'],
    providers: [ BinDrawService ]
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
                private readonly plotService: IntrogressionPlotService,
                private readonly binDrawService: BinDrawService) {
        super();
    }

    get guiMargins() {
        return this.plotService.guiMargins;
    }

    draw() {
        if (isNullOrUndefined(this.plotState.orderedAccessions)) { return; }
        this.binDrawService.drawBins(this.canvas.nativeElement,
                                     this.getContainerSize());
        this.updateHighlight();
    }

    updateHighlight() {
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

    protected dragAction(dragState: DragState): void {
        // Dragging 'rounded' to accession / bin indices.
        const newPos: Position = {
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

    protected getPositionTarget(mousePosition: Position): PlotArea {
        if ([this.plotState.orderedAccessions,
             this.plotState.interval,
             this.plotState.binsize].some(isNullOrUndefined)) {
            return { plotAreaType: 'background' };
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
            return { plotAreaType: 'background' };
        }

        const interval = this.plotState.interval;
        const binsize = this.plotState.binsize;

        const accession = this.plotState.orderedAccessions[accessionIndex];

        const result: PlotBin = {
            plotAreaType: 'bin',
            accessionLabel: this.plotService.getAccessionLabel(accession),
            accession: accession,
            startPosition: interval[0] + binIndex * binsize,
            endPosition: interval[0] + (binIndex + 1) * binsize - 1
        };
        return result;
    }

    private getContainerSize(): ContainerSize {
        return {
            height: this.canvas.nativeElement
                               .parentElement
                               .parentElement
                               .parentElement
                               .offsetHeight,
            width: this.canvas.nativeElement
                              .parentElement
                              .parentElement
                              .parentElement
                              .offsetWidth
        };
    }
}

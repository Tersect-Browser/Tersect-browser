import {
    Component,
    ElementRef,
    OnDestroy,
    OnInit,
    ViewChild
} from '@angular/core';

import { Subscription } from 'rxjs';

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
    BinDrawService
} from '../services/bin-draw.service';
import {
    PlotCreatorService
} from '../services/plot-creator.service';
import {
    PlotStateService
} from '../services/plot-state.service';
import {
    ContainerSize
} from '../tersect-distance-plot.component';

@Component({
    selector: 'app-bin-plot',
    templateUrl: './bin-plot.component.html',
    styleUrls: ['./bin-plot.component.css']
})
export class BinPlotComponent extends CanvasPlotElement
                              implements OnInit, OnDestroy  {
    @ViewChild('canvas', { static: true })
    private readonly canvas: ElementRef;

    @ViewChild('highlight', { static: true })
    private readonly highlight: ElementRef;

    /**
     * Drag start position in terms of the accession / bin index.
     */
    private dragStartIndices = { x: 0, y: 0 };
    private highlightUpdate: Subscription;

    constructor(private readonly plotState: PlotStateService,
                private readonly plotCreator: PlotCreatorService,
                private readonly binDrawService: BinDrawService) {
        super();
    }

    get guiMargins() {
        return this.plotCreator.guiMargins;
    }

    ngOnInit() {
        this.highlightUpdate = this.plotCreator
                                   .highlightSource.subscribe(() => {
            this.updateHighlight();
        });
    }

    ngOnDestroy() {
        this.highlightUpdate.unsubscribe();
    }

    draw() {
        this.binDrawService.drawBins(this.canvas.nativeElement,
                                     this.getContainerSize());
        this.updateHighlight();
    }

    protected dragAction(dragState: DragState): void {
        // Dragging 'rounded' to accession / bin indices.
        const newPos: Position = {
            x: Math.round(dragState.currentPosition.x
                          / this.plotCreator.binWidth
                          - this.dragStartIndices.x),
            y: Math.round(dragState.currentPosition.y
                          / this.plotCreator.binHeight
                          - this.dragStartIndices.y)
        };

        if (newPos.x > 0) {
            newPos.x = 0;
        }
        if (newPos.y > 0) {
            newPos.y = 0;
        }

        this.plotState.updatePosition(newPos);
    }

    protected dragStartAction(dragState: DragState): void {
        // Dragging 'rounded' to accession / bin indices.
        this.dragStartIndices = {
            x: dragState.startPosition.x / this.plotCreator.binWidth
               - this.plotState.plotPosition.x,
            y: dragState.startPosition.y / this.plotCreator.binHeight
               - this.plotState.plotPosition.y
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
                                    / this.plotCreator.binWidth)
                         - this.plotCreator.guiMargins.left
                         - this.plotState.plotPosition.x;
        const accessionIndex = Math.floor(mousePosition.y
                                          / this.plotCreator.binHeight)
                               - this.plotState.plotPosition.y;

        if (binIndex >= this.plotCreator.colNum
            || accessionIndex >= this.plotCreator.rowNum) {
            return { plotAreaType: 'background' };
        }

        const interval = this.plotState.interval;
        const binsize = this.plotState.binsize;

        const accession = this.plotState.orderedAccessions[accessionIndex];

        const result: PlotBin = {
            plotAreaType: 'bin',
            accessionLabel: this.plotCreator.getAccessionLabel(accession),
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

    private updateHighlight() {
        if (isNullOrUndefined(this.plotCreator.highlight)) {
            this.highlight.nativeElement.style.visibility = 'hidden';
        } else {
            const bpPerPixel = this.plotState.binsize
                               / this.plotCreator.zoomFactor;
            const plotOffset = this.plotCreator.guiMargins.left
                               + this.plotState.plotPosition.x;

            const leftPos = (this.plotCreator.highlight.start
                             - this.plotState.interval[0]) / bpPerPixel
                            + plotOffset * this.plotCreator.binWidth;

            const width = (this.plotCreator.highlight.end
                           - this.plotCreator.highlight.start + 1)
                          / bpPerPixel;

            this.highlight.nativeElement.style.left = `${leftPos}px`;
            this.highlight.nativeElement.style.width = `${width}px`;
            this.highlight.nativeElement.style.visibility = 'visible';
        }
    }
}

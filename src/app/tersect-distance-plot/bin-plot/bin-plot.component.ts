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
    PlotPosition
} from '../../shared/models/Plot';
import {
    getAccessionLabel
} from '../../tersect-browser/browser-settings';
import {
    isNullOrUndefined
} from '../../utils/utils';
import {
    CanvasPlotElement,
    DragState
} from '../CanvasPlotElement';
import {
    DistanceBinView
} from '../models/DistanceBinView';
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

    private storedBinView: DistanceBinView;

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
        if (isNullOrUndefined(this.storedBinView)) {
            this.storedBinView = new DistanceBinView(this.plotCreator.distanceBins,
                                                     this.plotState.orderedAccessions,
                                                     this.plotCreator.binHeight);
        }
        this.updateDistanceBinView(this.storedBinView);
        this.binDrawService.drawBins(this.storedBinView,
                                     this.plotCreator.guiMargins.left, 0,
                                     this.canvas.nativeElement);
        this.updateHighlight();
    }

    protected dragAction(dragState: DragState): void {
        // Dragging 'rounded' to accession / bin indices.
        const newPos: PlotPosition = {
            x: Math.round(dragState.currentPosition.x
                          / this.storedBinView.binWidth
                          - this.dragStartIndices.x),
            y: Math.round(dragState.currentPosition.y
                          / this.storedBinView.binHeight
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
            x: dragState.startPosition.x / this.storedBinView.binWidth
               - this.plotState.plotPosition.x,
            y: dragState.startPosition.y / this.storedBinView.binHeight
               - this.plotState.plotPosition.y
        };
    }

    protected dragStopAction(dragState: DragState): void {
        // No action
    }

    protected getPositionTarget(mousePosition: PlotPosition): PlotArea {
        if ([this.plotState.orderedAccessions,
             this.plotState.interval,
             this.plotState.binsize].some(isNullOrUndefined)) {
            return { plotAreaType: 'background' };
        }
        const binIndex = Math.floor(mousePosition.x
                                    / this.storedBinView.binWidth)
                         - this.plotCreator.guiMargins.left
                         - this.plotState.plotPosition.x;
        const accessionIndex = Math.floor(mousePosition.y
                                          / this.storedBinView.binHeight)
                               - this.plotState.plotPosition.y;

        if (binIndex >= this.storedBinView.colNum
            || accessionIndex >= this.storedBinView.rowNum) {
            return { plotAreaType: 'background' };
        }

        const interval = this.plotState.interval;
        const binsize = this.plotState.binsize;

        const accession = this.plotState.orderedAccessions[accessionIndex];

        const result: PlotBin = {
            plotAreaType: 'bin',
            accessionLabel: getAccessionLabel(this.plotState.accessionDictionary,
                                              accession),
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

    private updateDistanceBinView(binView: DistanceBinView) {
        binView.aspectRatio = this.plotCreator.aspectRatio;
        binView.binHeight = this.plotCreator.binHeight;
        binView.containerSize = this.getContainerSize();
        binView.orderedAccessions = this.plotState.orderedAccessions;
        binView.plotPosition = this.plotState.plotPosition;
        binView.sequenceGaps = this.plotCreator.sequenceGaps;
        binView.distanceBins = this.plotCreator.distanceBins;
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

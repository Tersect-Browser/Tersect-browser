import { Component, ElementRef, Input, Output, ViewChild, EventEmitter } from '@angular/core';

import {
    AccessionTreeView
} from '../../../../models/AccessionTreeView';
import {
    PlotAccession,
    PlotArea,
    PlotPosition
} from '../../../../models/Plot';
import {
    TreeDrawService
} from '../../../../services/tree-draw.service';
import {
    getAccessionLabel,
    isNullOrUndefined
} from '../../../../utils/utils';
import {
    PlotCreatorService
} from '../../services/plot-creator.service';
import {
    PlotStateService
} from '../../services/plot-state.service';
import {
    ContainerSize
} from '../../tersect-distance-plot.component';
import {
    CanvasPlotElement,
    DragState
} from '../CanvasPlotElement';
// import { EventEmitter } from 'events';

@Component({
    selector: 'app-tree-plot',
    templateUrl: './tree-plot.component.html',
    styleUrls: ['./tree-plot.component.css']
})
export class TreePlotComponent extends CanvasPlotElement {
    private static readonly TREE_CONTAINER_PROPORTION = 0.5;

    // @Output() offsetCanvasChange = new EventEmitter<number>();

    offsetCanvas: number;

    @ViewChild('canvas', { static: true })
    private readonly canvas: ElementRef;

    /**
     * Drag start position in terms of accession index.
     */
    private dragStartIndex = 0;

    private storedTreeView: AccessionTreeView;

    constructor(private readonly plotState: PlotStateService,
                private readonly plotCreator: PlotCreatorService,
                private readonly treeDrawService: TreeDrawService) {
        super();
    }

    get guiMargins() {
        return this.plotCreator.guiMargins;
    }

    draw() {
        if (isNullOrUndefined(this.storedTreeView)) {
            this.storedTreeView = new AccessionTreeView(this.plotState.pheneticTree,
                                                        this.plotState.orderedAccessions,
                                                        this.plotCreator.binHeight,
                                                        this.getContainerSize());
        }
        this.updateTreeView(this.storedTreeView);
        
        this.treeDrawService.draw(this.storedTreeView,
                                  0, this.plotCreator.offsetY,
                                  this.canvas.nativeElement);
        this.plotCreator.guiMargins.left = this.storedTreeView.offscreenCanvas.width
                                           / this.plotCreator.zoomFactor;
        
        this.offsetCanvas = this.storedTreeView.offscreenCanvas.width;

        // this.offsetCanvasChange.emit(this.offsetCanvas);

        // this.plotState.offsetCanvas$ = this.storedTreeView.offscreenCanvas.width;
        this.plotState.offsetCanvasSource.next(this.storedTreeView.offscreenCanvas.width);
    }

    protected dragAction(dragState: DragState): void {
        // Only vertical dragging, rounded to accession indices.
        const newPos: PlotPosition = {
            x: this.plotState.plotPosition.x,
            y: Math.round(dragState.currentPosition.y
                          / this.plotCreator.binHeight
                          - this.dragStartIndex)
        };

        if (newPos.y > 0) {
            newPos.y = 0;
        }

        this.plotState.updatePosition(newPos);
    }

    protected dragStartAction(dragState: DragState): void {
        // Dragging 'rounded' to accession index.
        this.dragStartIndex = dragState.startPosition.y
                              / this.plotCreator.binHeight
                              - this.plotState.plotPosition.y;
    }

    protected dragStopAction(dragState: DragState): void {
        // No action
    }

    protected getPositionTarget(mousePosition: PlotPosition): PlotArea {
        if (isNullOrUndefined(this.plotState.orderedAccessions)) {
            return { plotAreaType: 'background' };
        }
        const accessionIndex = Math.floor(mousePosition.y
                                          / this.plotCreator.binHeight)
                               - this.plotState.plotPosition.y;

        if (accessionIndex >= this.storedTreeView.accessionCount) {
            return { plotAreaType: 'background' };
        }
        const accession = this.plotState.orderedAccessions[accessionIndex];
        const result: PlotAccession = {
            plotAreaType: 'accession',
            accessionLabel: getAccessionLabel(this.plotState.accessionDictionary,
                                              accession),
            accession: accession
        };
        return result;
    }

    private getContainerSize(): ContainerSize {
        return {
            height: this.canvas.nativeElement
                               .parentElement
                               .parentElement
                               .parentElement
                               .offsetHeight - this.guiMargins.top,
            width: this.canvas.nativeElement
                              .parentElement
                              .parentElement
                              .parentElement
                              .offsetWidth
        };
    }

    private updateTreeView(treeView: AccessionTreeView) {
        treeView.accessionDictionary = this.plotState.accessionDictionary;
        treeView.accessionStyle = this.plotState.accessionStyle;
        treeView.tree = this.plotState.pheneticTree;
        treeView.canvasOffsetY = this.plotCreator.offsetY;
        treeView.containerSize = this.getContainerSize();
        treeView.textSize = this.plotCreator.binHeight;
        treeView.colorTrackWidth = this.plotCreator.binHeight;
        treeView.orderedAccessions = this.plotState.orderedAccessions;
        treeView.containerProportion = TreePlotComponent.TREE_CONTAINER_PROPORTION;
    }
}

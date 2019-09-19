import { Component, ElementRef, ViewChild } from '@angular/core';

import {
    PlotAccession,
    PlotArea,
    PlotPosition
} from '../../models/Plot';
import {
    isNullOrUndefined
} from '../../utils/utils';
import {
    CanvasPlotElement,
    DragState
} from '../CanvasPlotElement';
import {
    AccessionTreeView
} from '../models/AccessionTreeView';
import {
    PlotCreatorService
} from '../services/plot-creator.service';
import {
    PlotStateService
} from '../services/plot-state.service';
import {
    TreeDrawService
} from '../services/tree-draw.service';
import {
    ContainerSize
} from '../tersect-distance-plot.component';

@Component({
    selector: 'app-tree-plot',
    templateUrl: './tree-plot.component.html',
    styleUrls: ['./tree-plot.component.css']
})
export class TreePlotComponent extends CanvasPlotElement {
    @ViewChild('canvas', { static: true })
    private readonly canvas: ElementRef;

    private storedTreeView: AccessionTreeView;

    /**
     * Drag start position in terms of accession index.
     */
    private dragStartIndex = 0;

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
            this.storedTreeView = new AccessionTreeView(this.plotCreator.pheneticTree,
                                                        this.plotCreator.binHeight,
                                                        this.getContainerSize());
        }
        this.updateTreeView(this.storedTreeView);
        this.treeDrawService.drawTree(this.storedTreeView,
                                      0, this.plotCreator.offsetY,
                                      this.getContainerSize(),
                                      this.canvas.nativeElement);
        this.plotCreator.guiMargins.left = this.storedTreeView.offscreenCanvas.width
                                           / this.plotCreator.zoomFactor;
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
        if (accessionIndex >= this.plotCreator.rowNum) {
            return { plotAreaType: 'background' };
        }
        const accession = this.plotState.orderedAccessions[accessionIndex];
        const result: PlotAccession = {
            plotAreaType: 'accession',
            accessionLabel: this.plotCreator.getAccessionLabel(accession),
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
        treeView.tree = this.plotCreator.pheneticTree;
        treeView.canvasOffsetY = this.plotCreator.offsetY;
        treeView.containerSize = this.getContainerSize();
        treeView.textSize = this.plotCreator.binHeight;
        treeView.orderedAccessions = this.plotState.orderedAccessions;
    }
}

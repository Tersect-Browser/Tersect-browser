import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';

import {
    PlotAccession,
    PlotArea,
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
    AccessionTreeView
} from '../services/accession-tree-view';
import {
    IntrogressionPlotService
} from '../services/introgression-plot.service';
import {
    PlotStateService
} from '../services/plot-state.service';
import {
    TreeDrawService
} from '../services/tree-draw.service';

@Component({
    selector: 'app-tree-plot',
    templateUrl: './tree-plot.component.html',
    styleUrls: ['./tree-plot.component.css'],
    providers: [ TreeDrawService ]
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
                private readonly plotService: IntrogressionPlotService,
                private readonly treeDrawService: TreeDrawService) {
        super();
    }

    get guiMargins() {
        return this.plotService.guiMargins;
    }

    draw() {
        if (isNullOrUndefined(this.storedTreeView)) {
            this.storedTreeView = this.treeDrawService
                                      .createTreeView(this.getContainerSize());
        }
        this.treeDrawService.drawTree(this.canvas.nativeElement,
                                      this.storedTreeView,
                                      this.getContainerSize());
    }

    protected dragAction(dragState: DragState): void {
        // Only vertical dragging, rounded to accession indices.
        const newPos: Position = {
            x: this.plotService.plotPosition.x,
            y: Math.round(dragState.currentPosition.y
                          / this.plotService.binHeight
                          - this.dragStartIndex)
        };

        if (newPos.y > 0) {
            newPos.y = 0;
        }

        this.plotService.updatePosition(newPos);
    }

    protected dragStartAction(dragState: DragState): void {
        // Dragging 'rounded' to accession index.
        this.dragStartIndex = dragState.startPosition.y
                              / this.plotService.binHeight
                              - this.plotService.plotPosition.y;
    }

    protected dragStopAction(dragState: DragState): void {
        // No action
    }

    protected getPositionTarget(mousePosition: Position): PlotArea {
        if (isNullOrUndefined(this.plotState.orderedAccessions)) {
            return { plotAreaType: 'background' };
        }
        const accessionIndex = Math.floor(mousePosition.y
                                          / this.plotService.binHeight)
                               - this.plotService.plotPosition.y;
        if (accessionIndex >= this.plotService.rowNum) {
            return { plotAreaType: 'background' };
        }
        const accession = this.plotState.orderedAccessions[accessionIndex];
        const result: PlotAccession = {
            plotAreaType: 'accession',
            accessionLabel: this.plotService.getAccessionLabel(accession),
            accession: accession
        };
        return result;
    }

    private getContainerHeight(): number {
        return this.canvas.nativeElement
                          .parentElement
                          .parentElement
                          .parentElement
                          .offsetHeight - this.guiMargins.top;
    }

    private getContainerSize(): ContainerSize {
        return {
            height: this.getContainerHeight(),
            width: this.getContainerWidth()
        };
    }

    private getContainerWidth(): number {
        return this.canvas.nativeElement
                          .parentElement
                          .parentElement
                          .parentElement
                          .offsetWidth;
    }
}

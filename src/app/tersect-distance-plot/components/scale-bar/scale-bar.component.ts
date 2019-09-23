import { Component, ElementRef, Renderer2, ViewChild } from '@angular/core';

import {
    PlotArea,
    PlotPosition,
    PlotSequenceInterval,
    PlotSequencePosition
} from '../../../shared/models/Plot';
import {
    extractTags,
    isNullOrUndefined
} from '../../../utils/utils';
import {
    ScaleView
} from '../../models/ScaleView';
import {
    PlotCreatorService
} from '../../services/plot-creator.service';
import {
    PlotStateService
} from '../../services/plot-state.service';
import {
    ScaleDrawService
} from '../../services/scale-draw.service';
import {
    ContainerSize
} from '../../tersect-distance-plot.component';
import {
    CanvasPlotElement,
    DragState
} from '../CanvasPlotElement';

@Component({
    selector: 'app-scale-bar',
    templateUrl: './scale-bar.component.html',
    styleUrls: ['./scale-bar.component.css']
})
export class ScaleBarComponent extends CanvasPlotElement {
    @ViewChild('canvas', { static: true })
    private readonly canvas: ElementRef;

    private storedScaleView: ScaleView;

    constructor(private readonly plotState: PlotStateService,
                private readonly plotCreator: PlotCreatorService,
                private readonly scaleDrawService: ScaleDrawService,
                private readonly renderer: Renderer2) {
        super();
        this.hoverState.hoverDelay = 0;
        this.dragState.dragCursor = 'col-resize';
    }

    get guiMargins() {
        return this.plotCreator.guiMargins;
    }

    draw() {
        if (isNullOrUndefined(this.storedScaleView)) {
            this.storedScaleView = new ScaleView(this.plotState.interval,
                                                 this.plotState.binsize,
                                                 this.plotCreator.binWidth,
                                                 this.getContainerSize());
        }
        this.updateScaleView(this.storedScaleView);
        this.scaleDrawService.drawScale(this.storedScaleView,
                                        this.plotCreator.treePlotWidth, 0,
                                        this.canvas.nativeElement);
    }

    protected dragAction(dragState: DragState): void {
        // Using dragActionGlobal instead
    }

    protected dragStartAction(dragState: DragState): void {
        if (this.getPositionTarget(dragState.startPosition).plotAreaType
            === 'background') {
            this.stopDrag(dragState.event);
            return;
        }

        const unlistenDragMove = this.renderer.listen('window', 'mousemove',
                                                      event => {
            this.dragState.event = event;
            this.dragState.currentPosition = {
                x: event.clientX,
                y: event.clientX
            };
            this.dragActionGlobal(this.dragState);
        });
        const unlistenDragStop = this.renderer.listen('window', 'mouseup',
                                                      event => {
            this.dragState.event = event;
            this.dragStopActionGlobal(this.dragState);
            unlistenDragStop();
            unlistenDragMove();
        });
    }

    protected dragStopAction(dragState: DragState): void {
        // Using dragStopGlobal instead
    }

    protected getPositionTarget(position: PlotPosition): PlotArea {
        const interval = this.plotState.interval;
        const binsize = this.plotState.binsize;
        if ([interval, binsize].some(isNullOrUndefined)) {
            return { plotAreaType: 'background' };
        }
        const bpPerPixel = binsize / this.plotCreator.zoomFactor;
        const bpPosition = position.x * bpPerPixel + interval[0]
                           - (this.plotState.plotPosition.x
                              + this.plotCreator.guiMargins.left)
                             * binsize;
        if (bpPosition < interval[0] || bpPosition > interval[1]) {
            return { plotAreaType: 'background' };
        }
        const result: PlotSequencePosition = {
            plotAreaType: 'position',
            position: Math.round(bpPosition)
        };
        return result;
    }

    private dragActionGlobal(dragState: DragState): void {
        let startPos = dragState.startPosition;
        let endPos = dragState.currentPosition;
        if (dragState.startPosition.x > dragState.currentPosition.x) {
            startPos = dragState.currentPosition;
            endPos = dragState.startPosition;
        }
        const startTarget = this.getPositionTarget(startPos);
        const endTarget = this.getPositionTarget(endPos);

        this.plotCreator.highlight = {
            start: startTarget.plotAreaType === 'position'
                   ? (startTarget as PlotSequencePosition).position
                   : this.plotState.interval[0],
            end: endTarget.plotAreaType === 'position'
                 ? (endTarget as PlotSequencePosition).position
                 : this.plotState.interval[1]
        };

        const targetInterval: PlotSequenceInterval = {
            plotAreaType: 'interval',
            startPosition: this.plotCreator.highlight.start,
            endPosition: this.plotCreator.highlight.end
        };

        this.plotMouseHover.emit({
            x: dragState.event.clientX,
            y: dragState.event.clientY,
            target: targetInterval
        });
    }

    private dragStopActionGlobal(dragState: DragState): void {
        if (!isNullOrUndefined(this.plotCreator.highlight)) {
            const target: PlotSequenceInterval = {
                plotAreaType: 'interval',
                startPosition: this.plotCreator.highlight.start,
                endPosition: this.plotCreator.highlight.end
            };

            this.plotMouseClick.emit({
                x: dragState.event.clientX,
                y: dragState.event.clientY,
                target: target
            });

            const unlistenHighlightClear = this.renderer.listen('window',
                                                                'click',
                                                                event => {
                const tags = extractTags(event.target);

                // Clear highlight and listener if the user clicked a menu link
                // or outside the menu (modal overlay mask); bit of a hack
                if (tags.includes('APP-PLOT-CLICK-MENU')) {
                    if (tags.includes('A') || !tags.includes('P-MENU')) {
                        this.plotCreator.highlight = undefined;
                        unlistenHighlightClear();
                    }
                }
            });
        }
    }

    private getContainerSize(): ContainerSize {
        return {
            height: this.canvas.nativeElement.offsetHeight,
            width: this.canvas.nativeElement
                              .parentElement
                              .parentElement
                              .parentElement
                              .offsetWidth
        };
    }

    private updateScaleView(scaleView: ScaleView) {
        scaleView.interval = this.plotState.interval;
        scaleView.binsize = this.plotState.binsize;
        scaleView.binWidth = this.plotCreator.binWidth;
        scaleView.containerSize = this.getContainerSize();
        scaleView.plotPosition = this.plotState.plotPosition;
    }
}

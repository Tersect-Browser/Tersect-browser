import { formatPosition, findClosest, ceilTo, extractTags, isNullOrUndefined } from '../../utils/utils';
import { PlotPosition, PlotArea, PlotSequencePosition, PlotSequenceInterval } from '../../models/PlotPosition';
import { CanvasPlotElement, DragState } from '../CanvasPlotElement';
import { PlotStateService } from '../services/plot-state.service';
import { IntrogressionPlotService } from '../services/introgression-plot.service';

import { Component, ElementRef, ViewChild, Renderer2 } from '@angular/core';

interface ScaleTick {
    position: number;
    type: 'major' | 'minor';
    useLabel: boolean;
    unit?: 'Mbp' | 'kbp';
}

@Component({
    selector: 'app-scale-bar',
    templateUrl: './scale-bar.component.html',
    styleUrls: ['./scale-bar.component.css']
})
export class ScaleBarComponent extends CanvasPlotElement {
    @ViewChild('canvas', { static: true })
    private canvas: ElementRef;

    get guiMargins() {
        return this.plotService.gui_margins;
    }

    readonly GUI_SCALE_COLOR = '#327e04';
    readonly GUI_SCALE_FONT_SIZE = 13;
    readonly GUI_SCALE_FONT = 'Arial';
    readonly GUI_SCALE_TICK_BP_DISTANCES = [
        2500, 5000, 10000,
        25000, 50000, 100000,
        250000, 500000, 1000000,
        2500000, 5000000, 10000000
    ];
    readonly GUI_TICK_LENGTH = 6;

    /**
     * Optimal large tick distance in pixels. Ticks will be drawn as close to
     * this distance as possible using one of the GUI_SCALE_TICK_BP_DISTANCES.
     */
    readonly GUI_TICK_DISTANCE = 120;

    constructor(private plotState: PlotStateService,
                private plotService: IntrogressionPlotService,
                private renderer: Renderer2) {
        super();
        this.hoverState.hover_delay = 0;
        this.dragState.drag_cursor = 'col-resize';
    }

    private drawScaleTick(ctx: CanvasRenderingContext2D,
                          tick: ScaleTick) {
        const canvasHeight = this.canvas.nativeElement.offsetHeight;
        const bpPerPixel = this.plotState.binsize
                             / this.plotService.zoom_factor;
        const tickX = (this.plotService.plot_position.x
                       * this.plotState.binsize
                       + tick.position - this.plotState.interval[0])
                      / bpPerPixel;
        const tickSize = tick.type === 'major' ? this.GUI_TICK_LENGTH
                                               : this.GUI_TICK_LENGTH / 2;
        ctx.beginPath();
        ctx.moveTo(tickX, canvasHeight - 1);
        ctx.lineTo(tickX, canvasHeight - tickSize - 1);
        ctx.stroke();
        if (tick.useLabel) {
            const label = formatPosition(tick.position, tick.unit);
            let labelX = tickX;

            // Shifting first label if it does not fit in the viewing area
            const halfLabelWidth = ctx.measureText(label).width / 2;
            const labelOverflow = tickX - halfLabelWidth;
            if (labelOverflow < 0) {
                if (-labelOverflow > halfLabelWidth) {
                    labelX += halfLabelWidth;
                } else {
                    labelX -= labelOverflow;
                }
            }
            ctx.fillText(label, labelX, 2);
        }
    }

    private drawTicks(ctx: CanvasRenderingContext2D,
                      tickBpDistance: number,
                      genericTick: ScaleTick) {
        for (let pos = ceilTo(this.plotState.interval[0] - 1,
                              tickBpDistance);
                 pos < this.plotState.interval[1];
                 pos += tickBpDistance) {
            genericTick.position = pos;
            this.drawScaleTick(ctx, genericTick);
        }
    }

    private drawMajorTicks(ctx: CanvasRenderingContext2D,
                           tickBpDistance: number,
                           unit: 'Mbp' | 'kbp') {
        const tick: ScaleTick = {
            position: undefined,
            type: 'major',
            useLabel: true,
            unit: unit
        };
        this.drawTicks(ctx, tickBpDistance, tick);
    }

    private drawMinorTicks(ctx: CanvasRenderingContext2D,
                           tickBpDistance: number) {
        const tick: ScaleTick = {
            position: undefined,
            type: 'minor',
            useLabel: false
        };
        this.drawTicks(ctx, tickBpDistance, tick);
    }

    draw() {
        if (isNullOrUndefined(this.plotState.interval)) { return; }

        const canvasWidth = this.canvas.nativeElement
                                        .parentElement
                                        .parentElement
                                        .parentElement
                                        .offsetWidth;
        const canvasHeight = this.canvas.nativeElement.offsetHeight;
        this.canvas.nativeElement.width = canvasWidth;
        this.canvas.nativeElement.height = canvasHeight;
        const ctx: CanvasRenderingContext2D = this.canvas
                                                  .nativeElement
                                                  .getContext('2d');
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);

        // Correct for canvas positioning (no scale over label column)
        // and canvas pixel positioning (offset by 0.5 by default)
        const effectiveWidth = canvasWidth - this.plotService.labels_width;
        ctx.translate(0.5 + canvasWidth - effectiveWidth, 0.5);

        ctx.strokeStyle = this.GUI_SCALE_COLOR;
        ctx.lineWidth = 1;

        ctx.textBaseline = 'top';
        ctx.textAlign = 'center';
        ctx.font = `${this.GUI_SCALE_FONT_SIZE}px ${this.GUI_SCALE_FONT}`;

        const interval = this.plotState.interval;
        const bpPerPixel = this.plotState.binsize
                           / this.plotService.zoom_factor;
        const tickBpDistance = findClosest(this.GUI_TICK_DISTANCE
                                           * bpPerPixel,
                                           this.GUI_SCALE_TICK_BP_DISTANCES);
        const unit = tickBpDistance < 100000 ? 'kbp' : 'Mbp';

        const startX = (this.plotService.plot_position.x
                        * this.plotState.binsize)
                       / bpPerPixel;
        const endX = (this.plotService.plot_position.x
                      * this.plotState.binsize + interval[1] - interval[0])
                     / bpPerPixel;

        // Baseline
        ctx.beginPath();
        ctx.moveTo(startX, canvasHeight - 1);
        ctx.lineTo(endX, canvasHeight - 1);
        ctx.stroke();

        // Start / end ticks
        this.drawScaleTick(ctx, {
            position: interval[0],
            type: 'major',
            useLabel: false
        });
        this.drawScaleTick(ctx, {
            position: interval[1],
            type: 'major',
            useLabel: false
        });

        this.drawMajorTicks(ctx, tickBpDistance, unit);
        this.drawMinorTicks(ctx, tickBpDistance / 5);

        // Hide scale over labels
        ctx.clearRect(-(canvasWidth - effectiveWidth) - 0.5, 0,
                      this.plotService.labels_width,
                      canvasHeight);
    }

    protected getPositionTarget(position: PlotPosition): PlotArea {
        const interval = this.plotState.interval;
        const binsize = this.plotState.binsize;
        if ([interval, binsize].some(isNullOrUndefined)) {
            return { type: 'background' };
        }
        const bpPerPixel = binsize / this.plotService.zoom_factor;
        const bpPosition = position.x * bpPerPixel + interval[0]
                           - (this.plotService.plot_position.x
                              + this.plotService.gui_margins.left)
                             * binsize;
        if (bpPosition < interval[0] || bpPosition > interval[1]) {
            return { type: 'background' };
        }
        const result: PlotSequencePosition = {
            type: 'position',
            position: Math.round(bpPosition)
        };
        return result;
    }

    protected dragStartAction(dragState: DragState): void {
        if (this.getPositionTarget(dragState.start_position).type
            === 'background') {
            this.stopDrag(dragState.event);
            return;
        }

        const unlistenDragMove = this.renderer.listen('window', 'mousemove',
                                                      event => {
            this.dragState.event = event;
            this.dragState.current_position = {
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

    private dragActionGlobal(dragState: DragState): void {
        let startPos = dragState.start_position;
        let endPos = dragState.current_position;
        if (dragState.start_position.x > dragState.current_position.x) {
            startPos = dragState.current_position;
            endPos = dragState.start_position;
        }
        const startTarget = this.getPositionTarget(startPos);
        const endTarget = this.getPositionTarget(endPos);

        this.plotService.highlight = {
            start: startTarget.type === 'position'
                   ? (startTarget as PlotSequencePosition).position
                   : this.plotState.interval[0],
            end: endTarget.type === 'position'
                 ? (endTarget as PlotSequencePosition).position
                 : this.plotState.interval[1]
        };

        const targetInterval: PlotSequenceInterval = {
            type: 'interval',
            start_position: this.plotService.highlight.start,
            end_position: this.plotService.highlight.end
        };

        this.plotMouseHover.emit({
            x: dragState.event.clientX,
            y: dragState.event.clientY,
            target: targetInterval
        });
    }

    private dragStopActionGlobal(dragState: DragState): void {
        if (!isNullOrUndefined(this.plotService.highlight)) {
            const target: PlotSequenceInterval = {
                type: 'interval',
                start_position: this.plotService.highlight.start,
                end_position: this.plotService.highlight.end
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
                        this.plotService.highlight = undefined;
                        unlistenHighlightClear();
                    }
                }
            });
        }
    }

    protected dragStopAction(dragState: DragState): void {
        // Using dragStopGlobal instead
    }

    protected dragAction(dragState: DragState): void {
        // Using dragActionGlobal instead
    }
}

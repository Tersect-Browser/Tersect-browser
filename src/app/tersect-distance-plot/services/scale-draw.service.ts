import { Injectable } from '@angular/core';

import {
    ceilTo,
    findClosest,
    formatCanvasFont,
    formatPosition
} from '../../utils/utils';
import {
    ContainerSize
} from '../tersect-distance-plot.component';
import {
    PlotCreatorService
} from './plot-creator.service';
import {
    PlotStateService
} from './plot-state.service';

interface ScaleTick {
    position: number;
    type: 'major' | 'minor';
    useLabel: boolean;
    unit?: 'Mbp' | 'kbp';
}

@Injectable()
export class ScaleDrawService {
    static readonly GUI_SCALE_COLOR = '#327e04';
    static readonly GUI_SCALE_FONT = 'Arial';
    static readonly GUI_SCALE_FONT_SIZE = 13;
    static readonly GUI_SCALE_TICK_BP_DISTANCES = [
        2500, 5000, 10000,
        25000, 50000, 100000,
        250000, 500000, 1000000,
        2500000, 5000000, 10000000
    ];

    /**
     * Optimal large tick distance in pixels. Ticks will be drawn as close to
     * this distance as possible using one of the GUI_SCALE_TICK_BP_DISTANCES.
     */
    static readonly GUI_TICK_DISTANCE = 120;

    static readonly GUI_TICK_LENGTH = 6;

    constructor(private readonly plotState: PlotStateService,
                private readonly plotCreator: PlotCreatorService) { }

    private get bpPerPixel(): number {
        return this.plotState.binsize / this.plotCreator.zoomFactor;
    }

    drawScale(targetCanvas: HTMLCanvasElement, containerSize: ContainerSize) {
        this.updateCanvas(targetCanvas, containerSize);
        this.drawPositionScale(targetCanvas);
    }

    private drawAllTicks(ctx: CanvasRenderingContext2D) {
        const tickBpDistance = findClosest(ScaleDrawService.GUI_TICK_DISTANCE
                                           * this.bpPerPixel,
                                           ScaleDrawService.GUI_SCALE_TICK_BP_DISTANCES);
        const unit = tickBpDistance < 100000 ? 'kbp' : 'Mbp';

        this.drawBaseline(ctx);

        // Start tick
        this.drawScaleTick(ctx, {
            position: this.plotState.interval[0],
            type: 'major',
            useLabel: false
        });

        // End tick
        this.drawScaleTick(ctx, {
            position: this.plotState.interval[1],
            type: 'major',
            useLabel: false
        });

        this.drawMajorTicks(ctx, tickBpDistance, unit);
        this.drawMinorTicks(ctx, tickBpDistance / 5);
    }

    private drawBaseline(ctx: CanvasRenderingContext2D) {
        const interval = this.plotState.interval;
        const startX = (this.plotState.plotPosition.x * this.plotState.binsize)
                       / this.bpPerPixel;
        const endX = (this.plotState.plotPosition.x * this.plotState.binsize
                      + interval[1] - interval[0]) / this.bpPerPixel;

        const baselinePos = ctx.canvas.height - 1;
        ctx.beginPath();
        ctx.moveTo(startX, baselinePos);
        ctx.lineTo(endX, baselinePos);
        ctx.stroke();
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

    private drawScaleTick(ctx: CanvasRenderingContext2D,
                          tick: ScaleTick) {
        const bpPerPixel = this.plotState.binsize / this.plotCreator.zoomFactor;
        const tickX = (this.plotState.plotPosition.x * this.plotState.binsize
                       + tick.position - this.plotState.interval[0])
                      / bpPerPixel;
        const tickSize = tick.type === 'major'
                         ? ScaleDrawService.GUI_TICK_LENGTH
                         : ScaleDrawService.GUI_TICK_LENGTH / 2;
        ctx.beginPath();
        ctx.moveTo(tickX, ctx.canvas.height - 1);
        ctx.lineTo(tickX, ctx.canvas.height - tickSize - 1);
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

    private drawPositionScale(targetCanvas: HTMLCanvasElement) {
        const canvasWidth = targetCanvas.width;
        const canvasHeight = targetCanvas.height;
        const ctx: CanvasRenderingContext2D = targetCanvas.getContext('2d');
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);

        // Correct for canvas positioning (no scale over label column)
        // and canvas pixel positioning (offset by 0.5 by default)
        const effectiveWidth = canvasWidth - this.plotCreator.treePlotWidth;
        ctx.translate(0.5 + canvasWidth - effectiveWidth, 0.5);

        ctx.strokeStyle = ScaleDrawService.GUI_SCALE_COLOR;
        ctx.lineWidth = 1;

        ctx.textBaseline = 'top';
        ctx.textAlign = 'center';
        ctx.font = formatCanvasFont(ScaleDrawService.GUI_SCALE_FONT_SIZE,
                                    ScaleDrawService.GUI_SCALE_FONT);

        this.drawAllTicks(ctx);

        // Hide scale over labels
        ctx.clearRect(-(canvasWidth - effectiveWidth) - 0.5, 0,
                      this.plotCreator.treePlotWidth,
                      canvasHeight);
    }

    private updateCanvas(targetCanvas: HTMLCanvasElement,
                         containerSize: ContainerSize) {
        targetCanvas.width = containerSize.width;
        targetCanvas.height = containerSize.height;
    }
}

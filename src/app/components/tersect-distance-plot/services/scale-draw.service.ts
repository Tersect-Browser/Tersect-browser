import { Injectable } from '@angular/core';

import {
    ceilTo,
    findClosest,
    formatCanvasFont,
    formatPosition
} from '../../../utils/utils';
import {
    ScaleView
} from '../models/ScaleView';

interface ScaleTick {
    position: number;
    type: 'major' | 'minor';
    useLabel: boolean;
    unit?: 'Mbp' | 'kbp';
}

@Injectable({
    providedIn: 'root'
})
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

    drawScale(scaleView: ScaleView, offsetX: number, offsetY: number,
              targetCanvas: HTMLCanvasElement) {
        this.updateCanvas(scaleView, targetCanvas);
        this.drawPositionScale(scaleView, offsetX, offsetY, targetCanvas);
    }

    private drawAllTicks(scaleView: ScaleView, ctx: CanvasRenderingContext2D) {
        const tickBpDistance = findClosest(ScaleDrawService.GUI_TICK_DISTANCE
                                           * scaleView.bpPerPixel,
                                           ScaleDrawService.GUI_SCALE_TICK_BP_DISTANCES);
        const unit = tickBpDistance < 100000 ? 'kbp' : 'Mbp';

        this.drawBaseline(scaleView, ctx);

        // Start tick
        this.drawScaleTick(scaleView, ctx, {
            position: scaleView.interval[0],
            type: 'major',
            useLabel: false
        });

        // End tick
        this.drawScaleTick(scaleView, ctx, {
            position: scaleView.interval[1],
            type: 'major',
            useLabel: false
        });

        this.drawMajorTicks(scaleView, ctx, tickBpDistance, unit);
        this.drawMinorTicks(scaleView, ctx, tickBpDistance / 5);
    }

    private drawBaseline(scaleView: ScaleView, ctx: CanvasRenderingContext2D) {
        const interval = scaleView.interval;
        const startX = (scaleView.plotPosition.x * scaleView.binsize)
                       / scaleView.bpPerPixel;
        const endX = (scaleView.plotPosition.x * scaleView.binsize
                      + interval[1] - interval[0]) / scaleView.bpPerPixel;

        const baselinePos = ctx.canvas.height - 1;
        ctx.beginPath();
        ctx.moveTo(startX, baselinePos);
        ctx.lineTo(endX, baselinePos);
        ctx.stroke();
    }

    private drawMajorTicks(scaleView: ScaleView, ctx: CanvasRenderingContext2D,
                           tickBpDistance: number,
                           unit: 'Mbp' | 'kbp') {
        const tick: ScaleTick = {
            position: undefined,
            type: 'major',
            useLabel: true,
            unit: unit
        };
        this.drawTicks(scaleView, ctx, tickBpDistance, tick);
    }

    private drawMinorTicks(scaleView: ScaleView, ctx: CanvasRenderingContext2D,
                           tickBpDistance: number) {
        const tick: ScaleTick = {
            position: undefined,
            type: 'minor',
            useLabel: false
        };
        this.drawTicks(scaleView, ctx, tickBpDistance, tick);
    }

    private drawScaleTick(scaleView: ScaleView, ctx: CanvasRenderingContext2D,
                          tick: ScaleTick) {
        const tickX = (scaleView.plotPosition.x * scaleView.binsize
                       + tick.position - scaleView.interval[0])
                      / scaleView.bpPerPixel;
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

    private drawTicks(scaleView: ScaleView, ctx: CanvasRenderingContext2D,
                      tickBpDistance: number,
                      genericTick: ScaleTick) {
        for (let pos = ceilTo(scaleView.interval[0] - 1, tickBpDistance);
                 pos < scaleView.interval[1]; pos += tickBpDistance) {
            genericTick.position = pos;
            this.drawScaleTick(scaleView, ctx, genericTick);
        }
    }

    private drawPositionScale(scaleView: ScaleView,
                              offsetX: number, offsetY: number,
                              targetCanvas: HTMLCanvasElement) {
        const canvasWidth = targetCanvas.width;
        const canvasHeight = targetCanvas.height;
        const ctx: CanvasRenderingContext2D = targetCanvas.getContext('2d');
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);

        // Correct for canvas positioning (no scale over label column)
        // and canvas pixel positioning (offset by 0.5 by default)
        const effectiveWidth = canvasWidth - offsetX;
        ctx.translate(0.5 + canvasWidth - effectiveWidth, 0.5);

        ctx.strokeStyle = ScaleDrawService.GUI_SCALE_COLOR;
        ctx.lineWidth = 1;

        ctx.textBaseline = 'top';
        ctx.textAlign = 'center';
        ctx.font = formatCanvasFont(ScaleDrawService.GUI_SCALE_FONT_SIZE,
                                    ScaleDrawService.GUI_SCALE_FONT);

        this.drawAllTicks(scaleView, ctx);

        // Hide scale over labels
        ctx.clearRect(-(canvasWidth - effectiveWidth) - 0.5, 0,
                      offsetX, canvasHeight);
    }

    private updateCanvas(scaleView: ScaleView,
                         targetCanvas: HTMLCanvasElement) {
        targetCanvas.width = scaleView.containerSize.width;
        targetCanvas.height = scaleView.containerSize.height;
    }
}

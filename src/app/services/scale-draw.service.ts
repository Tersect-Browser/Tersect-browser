import { Injectable } from '@angular/core';

import {
    ContainerSize
} from '../components/tersect-distance-plot/tersect-distance-plot.component';
import {
    ScaleView
} from '../models/ScaleView';
import {
    ceilTo,
    findClosest,
    formatCanvasFont,
    formatPosition,
    isNullOrUndefined
} from '../utils/utils';

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
    static readonly MAJOR_TICK_PROPORTION = 0.25;
    static readonly MINOR_TICK_PROPORTION = 0.12;
    static readonly TEXT_SIZE_PROPORTION = 0.6;

    static readonly SCALE_COLOR = '#327e04';
    static readonly SCALE_FONT = 'Arial';
    static readonly SCALE_TICK_BP_DISTANCES = [
        2500, 5000, 10000,
        25000, 50000, 100000,
        250000, 500000, 1000000,
        2500000, 5000000, 10000000
    ];

    /**
     * Example maximum width text label on the scale, used for positining.
     */
    private static readonly MAX_WIDTH_SCALE_LABEL = '250.25 Mbp';
    private static readonly MAX_WIDTH_SCALE_LABEL_MARGIN = 1.5;

    draw(scaleView: ScaleView, offsetX: number, offsetY: number,
         targetCanvas: HTMLCanvasElement) {
        this.updateCanvas(scaleView, targetCanvas);
        this.drawPositionScale(scaleView, offsetX, offsetY, targetCanvas);
    }

    getImageData(scaleView: ScaleView): ImageData {
        const offscreenCanvas = document.createElement('canvas');
        this.draw(scaleView, 0, 0, offscreenCanvas);
        const ctx: CanvasRenderingContext2D = offscreenCanvas.getContext('2d');
        return ctx.getImageData(0, 0, offscreenCanvas.width,
                                offscreenCanvas.height);
    }

    getImageSize(scaleView: ScaleView): ContainerSize {
        return {
            width: scaleView.bpToPixelPosition(ceilTo(scaleView.interval[1],
                                                      scaleView.binsize)) + 1,
            height: scaleView.scaleBarHeight
        };
    }

    private drawAllTicks(scaleView: ScaleView, ctx: CanvasRenderingContext2D) {
        const tickBpDistance = this.getTickBpDistance(scaleView, ctx);
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
            position: ceilTo(scaleView.interval[1] - scaleView.interval[0] + 1,
                             scaleView.binsize) + scaleView.interval[0],
            type: 'major',
            useLabel: false
        }, -1);

        this.drawMajorTicks(scaleView, ctx, tickBpDistance, unit);
        this.drawMinorTicks(scaleView, ctx, tickBpDistance / 5);
    }

    private drawBaseline(scaleView: ScaleView, ctx: CanvasRenderingContext2D) {
        const endPos = ceilTo(scaleView.interval[1] - scaleView.interval[0] + 1,
                              scaleView.binsize) + scaleView.interval[0];
        const baselinePos = ctx.canvas.height - 1;
        ctx.beginPath();
        ctx.moveTo(0, baselinePos);
        ctx.lineTo(scaleView.bpToPixelPosition(endPos) - 1, baselinePos);
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
                          tick: ScaleTick, offsetX?: number) {
        let tickX = scaleView.bpToPixelPosition(tick.position);
        if (!isNullOrUndefined(offsetX)) {
            tickX += offsetX;
        }
        const tickSize = tick.type === 'major'
                         ? scaleView.scaleBarHeight
                           * ScaleDrawService.MAJOR_TICK_PROPORTION
                         : scaleView.scaleBarHeight
                           * ScaleDrawService.MINOR_TICK_PROPORTION;
        ctx.beginPath();
        ctx.moveTo(tickX, ctx.canvas.height - 1);
        ctx.lineTo(tickX, ctx.canvas.height - tickSize - 1);
        ctx.stroke();
        if (tick.useLabel) {
            const label = formatPosition(tick.position, tick.unit);
            let labelX = tickX;

            // Shifting first label if it does not fit in the viewing area
            const halfLabelWidth = ctx.measureText(label).width / 2;
            const labelOverflow = tickX - halfLabelWidth
                                  + this.getPlotScrollOffsetX(scaleView);
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

        // Correct for canvas positioning (no scale over label column),
        // plot position (horizontal scroll)
        // and canvas pixel positioning (offset by 0.5 by default)
        const fullOffsetX = 0.5 + offsetX + this.getPlotScrollOffsetX(scaleView);
        const fullOffsetY = 0.5;
        ctx.translate(fullOffsetX, fullOffsetY);

        ctx.strokeStyle = ScaleDrawService.SCALE_COLOR;
        ctx.lineWidth = 1;

        ctx.textBaseline = 'top';
        ctx.textAlign = 'center';
        ctx.font = formatCanvasFont(this.getFontSize(scaleView),
                                    ScaleDrawService.SCALE_FONT);

        this.drawAllTicks(scaleView, ctx);

        // Hide scale over labels
        ctx.clearRect(-fullOffsetX, 0, offsetX, canvasHeight);
    }

    private getFontSize(scaleView: ScaleView): number {
        return scaleView.scaleBarHeight
               * ScaleDrawService.TEXT_SIZE_PROPORTION;
    }

    /**
     * Get the optimum distance between major ticks in terms of base pairs.
     * This is the predicted width of the largest allowable labels
     * (plus a margin) rounded to nearest GUI_SCALE_TICK_BP_DISTANCES.
     * Ticks will be drawn as close to this distance as possible.
     */
    private getTickBpDistance(scaleView: ScaleView,
                              ctx: CanvasRenderingContext2D): number {
        const maxLabel = ctx.measureText(ScaleDrawService.MAX_WIDTH_SCALE_LABEL);
        return findClosest(maxLabel.width
                           * ScaleDrawService.MAX_WIDTH_SCALE_LABEL_MARGIN
                           * scaleView.bpPerPixel,
                           ScaleDrawService.SCALE_TICK_BP_DISTANCES);
    }

    private getPlotScrollOffsetX(scaleView: ScaleView): number {
        return scaleView.plotPosition.x * scaleView.binWidth;
    }

    private updateCanvas(scaleView: ScaleView,
                         targetCanvas: HTMLCanvasElement) {
        if (isNullOrUndefined(scaleView.containerSize)) {
            targetCanvas.width = this.getImageSize(scaleView).width;
        } else {
            targetCanvas.width = scaleView.containerSize.width;
        }
        targetCanvas.height = scaleView.scaleBarHeight;
    }
}

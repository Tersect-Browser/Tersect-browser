import { Component, ElementRef, ViewChild, Input } from '@angular/core';
import { formatPosition, findClosest, ceilTo } from '../../utils/utils';
import { IntrogressionPlotService } from '../../services/introgression-plot.service';

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

export class ScaleBarComponent {
    @ViewChild('topGuiCanvas') topGuiCanvas: ElementRef;

    readonly GUI_SCALE_COLOR = '#327e04';
    readonly GUI_SCALE_FONT_SIZE = 13;
    readonly GUI_SCALE_FONT = 'Arial';
    readonly GUI_SCALE_TICK_SIZES = [
        2500, 5000, 10000,
        25000, 50000, 100000,
        250000, 500000, 1000000,
        2500000, 5000000, 10000000
    ];
    readonly GUI_TICK_LENGTH = 6;

    /**
     * Optimal large tick distance in pixels. Ticks will be drawn as close to
     * this distance as possible using one of the GUI_SCALE_TICK_SIZES.
     */
    readonly GUI_TICK_DISTANCE = 120;

    constructor(private plotService: IntrogressionPlotService) {}

    private _drawScaleTick(ctx: CanvasRenderingContext2D,
                           tick: ScaleTick) {
        const canvas_height = this.topGuiCanvas.nativeElement.offsetHeight;
        const bp_per_pixel = this.plotService.binsize
                             / this.plotService.zoom_factor;
        const tick_x = (this.plotService.plot_position.x
                        * this.plotService.binsize
                        + tick.position - this.plotService.interval[0])
                       / bp_per_pixel;
        const tick_size = tick.type === 'major' ? this.GUI_TICK_LENGTH
                                                : this.GUI_TICK_LENGTH / 2;
        ctx.beginPath();
        ctx.moveTo(tick_x, canvas_height - 1);
        ctx.lineTo(tick_x, canvas_height - tick_size - 1);
        ctx.stroke();
        if (tick.useLabel) {
            const label = formatPosition(tick.position, tick.unit);
            let label_x = tick_x;

            // Shifting first label if it does not fit in the viewing area
            const half_label_width = ctx.measureText(label).width / 2;
            const label_overflow = tick_x - half_label_width;
            if (label_overflow < 0) {
                if (-label_overflow > half_label_width) {
                    label_x += half_label_width;
                } else {
                    label_x -= label_overflow;
                }
            }
            ctx.fillText(label, label_x, 2);
        }
    }

    public drawScale() {
        const canvas_width = this.topGuiCanvas.nativeElement.offsetWidth;
        const canvas_height = this.topGuiCanvas.nativeElement.offsetHeight;
        this.topGuiCanvas.nativeElement.width = canvas_width;
        this.topGuiCanvas.nativeElement.height = canvas_height;
        const ctx: CanvasRenderingContext2D = this.topGuiCanvas
                                                  .nativeElement
                                                  .getContext('2d');
        ctx.clearRect(0, 0, canvas_width, canvas_height);

        // Correct for canvas positioning (no scale over label column)
        // and canvas pixel positioning (offset by 0.5 by default)
        const effective_width = canvas_width - this.plotService.labels_width;
        ctx.translate(0.5 + canvas_width - effective_width, 0.5);

        ctx.strokeStyle = this.GUI_SCALE_COLOR;
        ctx.lineWidth = 1;

        ctx.textBaseline = 'top';
        ctx.textAlign = 'center';
        ctx.font = `${this.GUI_SCALE_FONT_SIZE}px ${this.GUI_SCALE_FONT}`;

        const bp_per_pixel = this.plotService.binsize
                             / this.plotService.zoom_factor;
        const tick_size = findClosest(this.GUI_TICK_DISTANCE * bp_per_pixel,
                                      this.GUI_SCALE_TICK_SIZES);
        const unit = tick_size < 100000 ? 'kbp' : 'Mbp';

        const x_start = (this.plotService.plot_position.x
                         * this.plotService.binsize)
                        / bp_per_pixel;
        const x_end = (this.plotService.plot_position.x
                       * this.plotService.binsize
                       + this.plotService.interval[1]
                       - this.plotService.interval[0])
                      / bp_per_pixel;

        // Baseline
        ctx.beginPath();
        ctx.moveTo(x_start, canvas_height - 1);
        ctx.lineTo(x_end, canvas_height - 1);
        ctx.stroke();

        // Start / end ticks
        this._drawScaleTick(ctx, {
            position: this.plotService.interval[0],
            type: 'major',
            useLabel: false
        });
        this._drawScaleTick(ctx, {
            position: this.plotService.interval[1],
            type: 'major',
            useLabel: false
        });

        // Major ticks
        for (let pos = ceilTo(this.plotService.interval[0] - 1, tick_size);
                 pos < this.plotService.interval[1]; pos += tick_size) {
            this._drawScaleTick(ctx, {
                position: pos,
                type: 'major',
                useLabel: true,
                unit: unit
            });
        }

        // Minor ticks
        for (let pos = ceilTo(this.plotService.interval[0] - 1, tick_size / 5);
                 pos < this.plotService.interval[1]; pos += tick_size / 5) {
            this._drawScaleTick(ctx, {
                position: pos,
                type: 'minor',
                useLabel: false
            });
        }

        // Hide scale over labels
        ctx.clearRect(-(canvas_width - effective_width) - 0.5, 0,
                      this.plotService.labels_width,
                      canvas_height);
    }

}

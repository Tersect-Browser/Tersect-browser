import { Component, ElementRef, ViewChild, Renderer2 } from '@angular/core';
import { formatPosition, findClosest, ceilTo } from '../../utils/utils';
import { IntrogressionPlotService } from '../../services/introgression-plot.service';
import { PlotPosition, PlotArea, PlotSequencePosition, PlotSequenceInterval } from '../../models/PlotPosition';
import { CanvasPlotElement, DragState } from '../CanvasPlotElement';
import { start } from 'repl';
import { isNullOrUndefined } from 'util';

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
    @ViewChild('canvas') canvas: ElementRef;

    get gui_margins() {
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

    constructor(private plotService: IntrogressionPlotService,
                private renderer: Renderer2) {
        super();
        this.hover_state.hover_delay = 0;
        this.drag_state.drag_cursor = 'col-resize';
    }

    private drawScaleTick(ctx: CanvasRenderingContext2D,
                           tick: ScaleTick) {
        const canvas_height = this.canvas.nativeElement.offsetHeight;
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

    private drawTicks(ctx: CanvasRenderingContext2D,
                       tick_bp_distance: number,
                       generic_tick: ScaleTick) {
        for (let pos = ceilTo(this.plotService.interval[0] - 1,
                              tick_bp_distance);
                 pos < this.plotService.interval[1];
                 pos += tick_bp_distance) {
            generic_tick.position = pos;
            this.drawScaleTick(ctx, generic_tick);
        }
    }

    private drawMajorTicks(ctx: CanvasRenderingContext2D,
                           tick_bp_distance: number,
                           unit: 'Mbp' | 'kbp') {
        const tick: ScaleTick = {
            position: undefined,
            type: 'major',
            useLabel: true,
            unit: unit
        };
        this.drawTicks(ctx, tick_bp_distance, tick);
    }

    private drawMinorTicks(ctx: CanvasRenderingContext2D,
                           tick_bp_distance: number) {
        const tick: ScaleTick = {
            position: undefined,
            type: 'minor',
            useLabel: false,
        };
        this.drawTicks(ctx, tick_bp_distance, tick);
    }

    draw() {
        const canvas_width = this.canvas.nativeElement
                                        .parentElement
                                        .parentElement
                                        .parentElement
                                        .offsetWidth;
        const canvas_height = this.canvas.nativeElement.offsetHeight;
        this.canvas.nativeElement.width = canvas_width;
        this.canvas.nativeElement.height = canvas_height;
        const ctx: CanvasRenderingContext2D = this.canvas
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
        const tick_bp_distance = findClosest(this.GUI_TICK_DISTANCE
                                             * bp_per_pixel,
                                             this.GUI_SCALE_TICK_BP_DISTANCES);
        const unit = tick_bp_distance < 100000 ? 'kbp' : 'Mbp';

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
        this.drawScaleTick(ctx, {
            position: this.plotService.interval[0],
            type: 'major',
            useLabel: false
        });
        this.drawScaleTick(ctx, {
            position: this.plotService.interval[1],
            type: 'major',
            useLabel: false
        });

        this.drawMajorTicks(ctx, tick_bp_distance, unit);
        this.drawMinorTicks(ctx, tick_bp_distance / 5);

        // Hide scale over labels
        ctx.clearRect(-(canvas_width - effective_width) - 0.5, 0,
                      this.plotService.labels_width,
                      canvas_height);
    }

    protected getPositionTarget(position: PlotPosition): PlotArea {
        const bp_per_pixel = this.plotService.binsize
                             / this.plotService.zoom_factor;
        const bp_position = position.x * bp_per_pixel
                            + this.plotService.interval[0]
                            - (this.plotService.plot_position.x
                               + this.plotService.gui_margins.left)
                              * this.plotService.binsize;
        if (bp_position < this.plotService.interval[0]
            || bp_position > this.plotService.interval[1]) {
            return { type: 'background' };
        }
        const result: PlotSequencePosition = {
            type: 'position',
            position: Math.round(bp_position)
        };
        return result;
    }

    protected dragStartAction(drag_state: DragState): void {
        const unlisten_drag_stop = this.renderer.listen('window',
                                                        'mouseup', (event) => {
            this.drag_state.event = event;
            this.dragStopActionGlobal(this.drag_state);
            unlisten_drag_stop();
        });
    }

    private dragStopActionGlobal(drag_state: DragState): void {
        if (!isNullOrUndefined(this.plotService.highlight)) {
            const target: PlotSequenceInterval = {
                type: 'interval',
                start_position: this.plotService.highlight.start,
                end_position: this.plotService.highlight.end
            }

            this.plotMouseClick.emit({
                x: drag_state.event.clientX,
                y: drag_state.event.clientY,
                target: target
            });

            // A bit of a hack, clearing the highlight after a mouseup anywhere
            // except the non-link (A) parts of the plot click menu
            const unlisten_highlight_clear = this.renderer.listen('window',
                                                                  'mouseup',
                                                                  (event) => {
                let target = event.target;
                while (target = target.parentNode) {
                    if (target.tagName === 'A') break;
                    if (target.tagName === 'P-MENU') return;
                }
                this.plotService.highlight = undefined;
                unlisten_highlight_clear();
            });
        }
    }

    protected dragStopAction(drag_state: DragState): void {
        // Using dragStopGlobal instead
    }

    protected dragAction(drag_state: DragState): void {
        const start_target = this.getPositionTarget(drag_state.start_position);
        const end_target = this.getPositionTarget(drag_state.current_position);
        if (start_target.type !== 'position'
            || end_target.type !== 'position') {
            return;
        }

        const start_pos = (start_target as PlotSequencePosition).position;
        const end_pos = (end_target as PlotSequencePosition).position;

        this.plotService.highlight = {
            start: end_pos > start_pos ? start_pos : end_pos,
            end: end_pos > start_pos ? end_pos : start_pos
        };

        const target: PlotSequenceInterval = {
            type: 'interval',
            start_position: this.plotService.highlight.start,
            end_position: this.plotService.highlight.end
        }

        this.plotMouseHover.emit({
            x: drag_state.event.clientX,
            y: drag_state.event.clientY,
            target: target
        });
    }

}

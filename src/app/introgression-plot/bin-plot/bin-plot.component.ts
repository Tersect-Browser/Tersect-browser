import { Component, ViewChild, ElementRef } from '@angular/core';
import { IntrogressionPlotService } from '../services/introgression-plot.service';
import { isNullOrUndefined } from 'util';
import { PlotPosition, PlotArea, PlotBin } from '../../models/PlotPosition';
import { CanvasPlotElement, DragState } from '../CanvasPlotElement';
import { PlotStateService } from '../services/plot-state.service';

@Component({
    selector: 'app-bin-plot',
    templateUrl: './bin-plot.component.html',
    styleUrls: ['./bin-plot.component.css']
})

export class BinPlotComponent extends CanvasPlotElement {
    @ViewChild('canvas') canvas: ElementRef;
    @ViewChild('highlight') highlight: ElementRef;

    /**
     * Drag start position in terms of the accession / bin index.
     */
    private drag_start_indices = { x: 0, y: 0 };

    get gui_margins() {
        return this.plotService.gui_margins;
    }

    constructor(private plotState: PlotStateService,
                private plotService: IntrogressionPlotService) { super(); }

    draw() {
        if (isNullOrUndefined(this.plotService.plot_array)) { return; }

        this.canvas.nativeElement
                   .style.width = `${this.plotState.zoom_level}%`;
        this.canvas.nativeElement
                   .style.height = `${this.plotState.zoom_level
                                      / this.plotService.aspect_ratio}%`;

        this.canvas.nativeElement.width = this.canvas.nativeElement
                                                     .parentElement
                                                     .parentElement
                                                     .parentElement
                                                     .offsetWidth;
        this.canvas.nativeElement.height = this.canvas.nativeElement
                                                      .parentElement
                                                      .parentElement
                                                      .parentElement
                                                      .offsetHeight;

        const ctx: CanvasRenderingContext2D = this.canvas.nativeElement
                                                         .getContext('2d');
        ctx.clearRect(0, 0, this.canvas.nativeElement.width,
                      this.canvas.nativeElement.height);
        ctx.putImageData(new ImageData(this.plotService.plot_array,
                                       this.plotService.col_num,
                                       this.plotService.row_num),
                         this.plotService.plot_position.x + this.plotService
                                                                .gui_margins
                                                                .left,
                         this.plotService.plot_position.y);
        this.updateHighlight();
    }

    updateHighlight() {
        if (isNullOrUndefined(this.plotService.highlight)) {
            this.highlight.nativeElement.style.visibility = 'hidden';
        } else {
            const bp_per_pixel = this.plotState.binsize
                                 / this.plotService.zoom_factor;
            const plot_offset = (this.plotService.gui_margins.left
                                 + this.plotService.plot_position.x);

            const left_pos = (this.plotService.highlight.start
                              - this.plotState.interval[0]) / bp_per_pixel
                             + plot_offset * this.plotService.bin_width;

            const width = (this.plotService.highlight.end
                           - this.plotService.highlight.start + 1)
                          / bp_per_pixel;

            this.highlight.nativeElement.style.left = `${left_pos}px`;
            this.highlight.nativeElement.style.width = `${width}px`;
            this.highlight.nativeElement.style.visibility = 'visible';
        }
    }

    protected getPositionTarget(mouse_position: PlotPosition): PlotArea {
        const bin_index = Math.floor(mouse_position.x
                                     / this.plotService.bin_width)
                          - this.plotService.gui_margins.left
                          - this.plotService.plot_position.x;
        const accession_index = Math.floor(mouse_position.y
                                           / this.plotService.bin_height)
                                - this.plotService.plot_position.y;

        if (bin_index >= this.plotService.col_num
            || accession_index >= this.plotService.row_num) {
            return { type: 'background' };
        }

        const interval = this.plotState.interval;
        const binsize = this.plotState.binsize;

        const accession = this.plotState.sorted_accessions[accession_index];

        const result: PlotBin = {
            type: 'bin',
            accession_label: this.plotService.getAccesionLabel(accession),
            accession: accession,
            start_position: interval[0] + bin_index * binsize,
            end_position: interval[0] + (bin_index + 1) * binsize - 1
        };
        return result;
    }

    protected dragStartAction(drag_state: DragState): void {
        // Dragging 'rounded' to accession / bin indices.
        this.drag_start_indices = {
            x: drag_state.start_position.x / this.plotService.bin_width
                - this.plotService.plot_position.x,
            y: drag_state.start_position.y / this.plotService.bin_height
                - this.plotService.plot_position.y
        };
    }

    protected dragStopAction(drag_state: DragState): void {
        // No action
    }

    protected dragAction(drag_state: DragState): void {
        // Dragging 'rounded' to accession / bin indices.
        const new_pos: PlotPosition = {
            x: Math.round(drag_state.current_position.x
                            / this.plotService.bin_width
                            - this.drag_start_indices.x),
            y: Math.round(drag_state.current_position.y
                            / this.plotService.bin_height
                            - this.drag_start_indices.y)
        };

        if (new_pos.x > 0) {
            new_pos.x = 0;
        }
        if (new_pos.y > 0) {
            new_pos.y = 0;
        }

        this.plotService.updatePosition(new_pos);
    }

}

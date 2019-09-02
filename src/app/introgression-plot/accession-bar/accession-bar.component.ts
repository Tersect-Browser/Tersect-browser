import { PlotPosition, PlotAccession, PlotArea } from '../../models/PlotPosition';
import { TreeNode, getTreeDepth, getTreeDepthLinear } from '../../clustering/clustering';
import { ceilTo, deepCopy } from '../../utils/utils';
import { CanvasPlotElement, DragState } from '../CanvasPlotElement';
import { IntrogressionPlotService } from '../services/introgression-plot.service';
import { PlotStateService } from '../services/plot-state.service';
import { TreeQuery } from '../../models/TreeQuery';
import { AccessionDisplayStyle, AccessionDictionary } from '../../introgression-browser/browser-settings';

import { Component, ViewChild, ElementRef, OnInit } from '@angular/core';
import { isNullOrUndefined } from 'util';
import * as deepEqual from 'fast-deep-equal';

interface StoredAccessionBarState {
    canvas: HTMLCanvasElement;
    canvas_yoffset: number;
    accession_style: AccessionDisplayStyle;
    zoom_level: number;
    tree_query: TreeQuery;
    container_width: number;
    accession_dictionary: AccessionDictionary;
}

@Component({
    selector: 'app-accession-bar',
    templateUrl: './accession-bar.component.html',
    styleUrls: ['./accession-bar.component.css']
})

export class AccessionBarComponent extends CanvasPlotElement implements OnInit {
    @ViewChild('canvas', { static: true }) canvas: ElementRef;

    readonly GUI_TREE_BG_COLOR = '#FFFFFF';
    readonly GUI_TREE_FONT = 'Courier New';
    readonly GUI_TREE_TEXT_COLOR = '#000000';
    readonly GUI_TREE_STEP_WIDTH = 2;
    readonly GUI_TREE_LINE_WIDTH = 0.2;
    readonly GUI_TREE_LINE_DASH = [0.2, 0.2];
    readonly GUI_TREE_LINE_DASH_STYLE = 'rgba(0, 0, 0, 0.2)';
    readonly GUI_TREE_LINE_DASH_WIDTH = 0.2;
    readonly GUI_TREE_LEFT_MARGIN = 5;

    /**
     * Width of the color tracks in multiples of the bin width.
     */
    readonly GUI_TREE_COLOR_TRACK_WIDTH = 2;

    /* Proportion of the width of the plot taken up by accession trees. This
     * should be half of the screen by default.
     */
    readonly GUI_TREE_PLOT_PROPORTION = 0.5;

    /**
     * Drag start position in terms of accession index.
     */
    private drag_start_index = 0;

    /**
     * The stored canvas height is limited due to browser-specific limits.
     * The image requires redrawing when the user scrolls past this limit.
     */
    readonly STORED_CANVAS_HEIGHT = 16000;

    /**
     * Step size used when vertically offsetting the stored canvas.
     */
    readonly STORED_CANVAS_OFFSET_STEP = ceilTo(this.STORED_CANVAS_HEIGHT / 2,
                                                this.plotService.bin_height);

    private stored_state: StoredAccessionBarState = {
        canvas: undefined,
        canvas_yoffset: 0,
        accession_style: undefined,
        container_width: undefined,
        tree_query: undefined,
        zoom_level: undefined,
        accession_dictionary: undefined
    };

    get gui_margins() {
        return this.plotService.gui_margins;
    }

    constructor(private plotState: PlotStateService,
                private plotService: IntrogressionPlotService) { super(); }

    ngOnInit() {
        this.stored_state.canvas = document.createElement('canvas');
        this.stored_state.canvas.height = this.STORED_CANVAS_HEIGHT;
    }

    private getContainerWidth(): number {
        return this.canvas.nativeElement
                          .parentElement
                          .parentElement
                          .parentElement
                          .offsetWidth;
    }

    private getContainerHeight(): number {
        return this.canvas.nativeElement
                          .parentElement
                          .parentElement
                          .parentElement
                          .offsetHeight;
    }

    private getAccessionBarHeight(): number {
        return this.getContainerHeight() - this.gui_margins.top;
    }

    /**
     * Return the height of the stored canvas that overflows the visible area.
     * This represents a pre-drawn area available for scrolling. When this is
     * negative, more of the canvas needs to be drawn.
     */
    private getStoredOverflowHeight(): number {
        const yoffset = this.plotService.yoffset;
        return this.STORED_CANVAS_HEIGHT - this.getAccessionBarHeight()
               + yoffset - this.stored_state.canvas_yoffset;
    }

    /**
     * Return true if stored canvas requires redrawing due to scrolling.
     * Note: this method applies the required vertical offset to the stored
     * canvas as a side-effect.
     */
    private scrollUpdate(): boolean {
        // Update yoffset and redraw stored canvas when out of scrolling area.
        let overflow = this.getStoredOverflowHeight();
        if (overflow <= 0) {
            while (overflow <= 0) {
                this.stored_state
                    .canvas_yoffset -= this.STORED_CANVAS_OFFSET_STEP;
                overflow = this.getStoredOverflowHeight();
            }
            return true;
        }
        if (overflow > this.STORED_CANVAS_HEIGHT
                        - this.getAccessionBarHeight()) {
            while (overflow > this.STORED_CANVAS_HEIGHT
                                - this.getAccessionBarHeight()) {
                this.stored_state
                    .canvas_yoffset += this.STORED_CANVAS_OFFSET_STEP;
                overflow = this.getStoredOverflowHeight();
            }
            return true;
        }
        return false;
    }

    private updateRequired(): boolean {
        if (this.scrollUpdate()) {
            return true;
        }

        const container_width = this.getContainerWidth();
        if (isNullOrUndefined(this.stored_state)
            || isNullOrUndefined(this.stored_state.canvas)
            || this.stored_state.zoom_level !== this.plotState.zoom_level
            || this.stored_state.accession_style
               !== this.plotState.accession_style
            || this.stored_state.container_width !== container_width
            || !deepEqual(this.stored_state.tree_query,
                          this.plotService.phenTree.query)
            || !deepEqual(this.stored_state.accession_dictionary,
                          this.plotState.accession_dictionary)) {
            return true;
        }

        return false;
    }

    private updateImage() {
        const text_height = this.plotService.bin_height;
        this.updateCanvasWidth(this.stored_state.canvas);

        const ctx: CanvasRenderingContext2D = this.stored_state
                                                  .canvas.getContext('2d');

        // Draw background
        ctx.fillStyle = this.GUI_TREE_BG_COLOR;
        ctx.fillRect(0, 0, this.plotService.labels_width,
                     this.stored_state.canvas.height);

        // Draw labels
        ctx.font = `${text_height}px ${this.GUI_TREE_FONT}`;
        if (this.plotState.accession_style === 'labels') {
            this.drawSimpleLabels(ctx);
        } else {
            this.drawLabelTree(ctx);
        }
        this.drawColorTracks(ctx);

        // Save current state
        this.stored_state.accession_style = this.plotState.accession_style;
        this.stored_state.container_width = this.getContainerWidth();
        this.stored_state.tree_query = this.plotService.phenTree.query;
        this.stored_state.zoom_level = this.plotState.zoom_level;
        this.stored_state
            .accession_dictionary = deepCopy(this.plotState
                                                 .accession_dictionary);
    }

    drawColorTracks(ctx: CanvasRenderingContext2D) {
        this.plotState.sorted_accessions.forEach((acc_id, row_index) => {
            const track_width = this.GUI_TREE_COLOR_TRACK_WIDTH
                                * this.plotService.bin_width;
            const colors = this.plotService.getAccessionColors(acc_id);
            colors.forEach((col, j) => {
                const xpos = this.stored_state.canvas.width
                             - (j + 1) * track_width;
                const ypos = row_index * this.plotService.bin_height;
                ctx.fillStyle = col;
                ctx.fillRect(xpos, ypos, track_width,
                             this.plotService.bin_height);
            });
        });
    }

    draw() {
        if (isNullOrUndefined(this.plotState.sorted_accessions)) { return; }

        if (this.updateRequired()) {
            this.updateImage();
        }

        this.canvas.nativeElement.height = this.getContainerHeight();
        const ctx: CanvasRenderingContext2D = this.canvas.nativeElement
                                                         .getContext('2d');
        ctx.clearRect(0, 0, this.canvas.nativeElement.width,
                      this.canvas.nativeElement.height);

        ctx.drawImage(this.stored_state.canvas, 0,
                      this.plotService.yoffset
                      - this.stored_state.canvas_yoffset);
    }

    private getEdgeLength(node: TreeNode): number {
        if (this.plotState.accession_style === 'tree_simple') {
            return 1;
        } else if (this.plotState.accession_style === 'tree_linear') {
            return node.length;
        } else {
            // Should not happen
            return 0;
        }
    }

    private _drawLabelTree(subtree: TreeNode, base_xpos: number,
                           ctx: CanvasRenderingContext2D,
                           background_width: number, text_height: number,
                           yoffset: number, scale: number,
                           draw_state: { current_row: number }) {
        let prev_ypos = yoffset + draw_state.current_row * text_height;
        const subtree_xpos = [];
        const subtree_ypos = [];

        if (subtree.children.length) {
            subtree.children.forEach(child => {
                const child_xpos = base_xpos + this.getEdgeLength(child)
                                               * scale;
                this._drawLabelTree(child, child_xpos, ctx,
                                    background_width, text_height,
                                    yoffset, scale,
                                    draw_state);
                subtree_xpos.push(child_xpos);
                const cur_ypos = yoffset + draw_state.current_row * text_height;
                subtree_ypos.push((prev_ypos + cur_ypos) / 2);
                prev_ypos = cur_ypos;
            });

            ctx.beginPath();
            ctx.lineWidth = this.GUI_TREE_LINE_WIDTH
                            * this.plotService.zoom_factor;
            ctx.strokeStyle = '#000000';
            ctx.setLineDash([]);

            // Vertical line (from center of first to center of second subtrees)
            ctx.moveTo(base_xpos, subtree_ypos[0]);
            ctx.lineTo(base_xpos, subtree_ypos[subtree_ypos.length - 1]);

            // Horizontal lines to individual subtrees
            subtree_xpos.forEach((child_xpos, i) => {
                ctx.moveTo(base_xpos, subtree_ypos[i]);
                ctx.lineTo(child_xpos, subtree_ypos[i]);
            });
            ctx.stroke();
        } else {
            const label = this.plotService
                              .getAccessionLabel(subtree.taxon.name);
            ctx.fillText(label, base_xpos, prev_ypos);
            ctx.beginPath();
            ctx.lineWidth = this.GUI_TREE_LINE_DASH_WIDTH
                            * this.plotService.zoom_factor;
            ctx.strokeStyle = this.GUI_TREE_LINE_DASH_STYLE;
            ctx.setLineDash(this.GUI_TREE_LINE_DASH.map(
                x => x * this.plotService.zoom_factor
            ));
            ctx.moveTo(base_xpos + ctx.measureText(label).width + 5,
                       prev_ypos + text_height / 2 - 0.5);
            ctx.lineTo(background_width, prev_ypos + text_height / 2 - 0.5);
            ctx.stroke();
            draw_state.current_row++;
        }
    }

    private drawLabelTree(ctx: CanvasRenderingContext2D) {
        const text_height = this.plotService.bin_height;
        ctx.fillStyle = this.GUI_TREE_TEXT_COLOR;
        ctx.textBaseline = 'top';
        const draw_state = { current_row: 0 };

        const scale = this.getTreeScale(ctx);

        const initial_xpos = this.GUI_TREE_LEFT_MARGIN;
        this._drawLabelTree(this.plotService.phenTree.tree, initial_xpos, ctx,
                            this.plotService.labels_width,
                            text_height, this.stored_state.canvas_yoffset,
                            scale, draw_state);
    }

    private getTreeScale(ctx: CanvasRenderingContext2D): number {
        const available_width = this.stored_state.canvas.width
                                - this.getMaxLabelWidth(ctx)
                                - this.getColorTracksWidth()
                                - this.plotService.bin_width
                                - this.GUI_TREE_LEFT_MARGIN;
        if (this.plotState.accession_style === 'tree_simple') {
            return available_width / getTreeDepth(this.plotService
                                                      .phenTree.tree);
        } else if (this.plotState.accession_style === 'tree_linear') {
            return available_width / getTreeDepthLinear(this.plotService
                                                            .phenTree.tree);
        } else {
            // Should not happen
            return 0;
        }
    }

    private drawSimpleLabels(ctx: CanvasRenderingContext2D) {
        const text_height = this.plotService.bin_height;
        ctx.fillStyle = this.GUI_TREE_TEXT_COLOR;
        ctx.textBaseline = 'top';
        this.plotState.sorted_accessions.forEach((acc, index) => {
            ctx.fillText(this.plotService.getAccessionLabel(acc), 0,
                         index * text_height + this.stored_state
                                                   .canvas_yoffset);
        });
    }

    private updateCanvasWidth(canvas: HTMLCanvasElement) {
        const ctx: CanvasRenderingContext2D = canvas.getContext('2d');
        let width: number;
        if (this.plotState.accession_style === 'labels') {
            width = ceilTo(this.getMaxLabelWidth(ctx)
                           + this.getColorTracksWidth(),
                           this.plotService.bin_width);
        } else {
            width = ceilTo(this.getContainerWidth()
                           * this.GUI_TREE_PLOT_PROPORTION,
                           this.plotService.bin_width);
        }
        canvas.width = width;
        this.canvas.nativeElement.width = width;
        this.plotService.gui_margins.left = width / this.plotService.zoom_factor;
    }

    /**
     * Get the total width of the group color tracks.
     */
    private getColorTracksWidth() {
        return this.GUI_TREE_COLOR_TRACK_WIDTH
               * this.plotService.getMaxColorCount()
               * this.plotService.bin_width;
    }

    private getMaxLabelWidth(ctx: CanvasRenderingContext2D) {
        ctx.font = `${this.plotService.bin_height}px ${this.GUI_TREE_FONT}`;
        return Math.max(
            ...this.plotState.sorted_accessions.map(acc =>
                ctx.measureText(this.plotService.getAccessionLabel(acc)).width
            )
        );
    }

    protected getPositionTarget(mouse_position: PlotPosition): PlotArea {
        if (isNullOrUndefined(this.plotState.sorted_accessions)) {
            return { type: 'background' };
        }
        const accession_index = Math.floor(mouse_position.y
                                           / this.plotService.bin_height)
                                - this.plotService.plot_position.y;
        if (accession_index >= this.plotService.row_num) {
            return { type: 'background' };
        }
        const accession = this.plotState.sorted_accessions[accession_index];
        const result: PlotAccession = {
            type: 'accession',
            accession_label: this.plotService.getAccessionLabel(accession),
            accession: accession
        };
        return result;
    }

    protected dragStartAction(drag_state: DragState): void {
        // Dragging 'rounded' to accession index.
        this.drag_start_index = drag_state.start_position.y
                                / this.plotService.bin_height
                                - this.plotService.plot_position.y;
    }

    protected dragStopAction(drag_state: DragState): void {
        // No action
    }

    protected dragAction(drag_state: DragState): void {
        // Only vertical dragging, rounded to accession indices.
        const new_pos: PlotPosition = {
            x: this.plotService.plot_position.x,
            y: Math.round(drag_state.current_position.y
                          / this.plotService.bin_height
                          - this.drag_start_index)
        };

        if (new_pos.y > 0) {
            new_pos.y = 0;
        }

        this.plotService.updatePosition(new_pos);
    }

}

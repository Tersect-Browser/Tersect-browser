import { PlotPosition, PlotAccession, PlotArea } from '../../models/PlotPosition';
import { TreeNode, getTreeDepth, getTreeDepthLinear } from '../../clustering/clustering';
import { ceilTo } from '../../utils/utils';
import { CanvasPlotElement, DragState } from '../CanvasPlotElement';
import { IntrogressionPlotService } from '../services/introgression-plot.service';
import { PlotStateService } from '../services/plot-state.service';

import { Component, ViewChild, ElementRef } from '@angular/core';
import { isNullOrUndefined } from 'util';

@Component({
    selector: 'app-accession-bar',
    templateUrl: './accession-bar.component.html',
    styleUrls: ['./accession-bar.component.css']
})

export class AccessionBarComponent extends CanvasPlotElement {
    @ViewChild('canvas') canvas: ElementRef;

    readonly GUI_TREE_BG_COLOR = '#FFFFFF';
    readonly GUI_TREE_FONT = 'Courier New';
    readonly GUI_TREE_TEXT_COLOR = '#000000';
    readonly GUI_TREE_STEP_WIDTH = 2;
    readonly GUI_TREE_LINE_WIDTH = 0.2;
    readonly GUI_TREE_LINE_DASH = [0.2, 0.2];
    readonly GUI_TREE_LINE_DASH_STYLE = 'rgba(0, 0, 0, 0.2)';
    readonly GUI_TREE_LINE_DASH_WIDTH = 0.2;
    readonly GUI_TREE_LEFT_MARGIN = 5;

    /* Proportion of the width of the plot taken up by accession trees. This
     * should be half of the screen by default.
     */
    readonly GUI_TREE_PLOT_PROPORTION = 0.5;

    /**
     * Drag start position in terms of accession index.
     */
    private drag_start_index = 0;

    get gui_margins() {
        return this.plotService.gui_margins;
    }

    constructor(private plotState: PlotStateService,
                private plotService: IntrogressionPlotService) { super(); }

    draw() {
        if (isNullOrUndefined(this.plotState.sorted_accessions)) { return; }

        this.canvas.nativeElement.height = this.canvas.nativeElement
                                                      .parentElement
                                                      .parentElement
                                                      .parentElement
                                                      .offsetHeight;
        const ctx: CanvasRenderingContext2D = this.canvas.nativeElement
                                                         .getContext('2d');
        ctx.clearRect(0, 0, this.canvas.nativeElement.width,
                      this.canvas.nativeElement.height);

        this.updateComponentWidth();

        const text_height = this.plotService.bin_height;
        ctx.font = `${text_height}px ${this.GUI_TREE_FONT}`;

        // Offset due to plot scroll
        const yoffset = ceilTo(this.plotService.plot_position.y * text_height,
                               text_height);

        // Draw background
        ctx.fillStyle = this.GUI_TREE_BG_COLOR;
        ctx.fillRect(0, 0, this.plotService.labels_width,
                     this.canvas.nativeElement.height);

        // Draw labels
        if (this.plotState.accession_style === 'labels') {
            this.drawSimpleLabels(ctx, text_height, yoffset);
        } else {
            this.drawLabelTree(ctx, text_height, yoffset);
        }
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
            subtree.children.forEach((child) => {
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
            const label = this.plotService.getAccesionLabel(subtree.taxon.name);
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

    private drawLabelTree(ctx: CanvasRenderingContext2D,
                          text_height: number, yoffset: number) {
        ctx.fillStyle = this.GUI_TREE_TEXT_COLOR;
        ctx.textBaseline = 'top';
        const draw_state = { current_row: 0 };

        const scale = this.getTreeScale(ctx);

        const initial_xpos = this.GUI_TREE_LEFT_MARGIN;
        this._drawLabelTree(this.plotService.phyloTree.tree, initial_xpos, ctx,
                            this.plotService.labels_width,
                            text_height, yoffset, scale, draw_state);
    }

    private getTreeScale(ctx: CanvasRenderingContext2D): number {
        const available_width = this.canvas.nativeElement.width
                                - this.getMaxLabelWidth(ctx)
                                - this.plotService.bin_width
                                - this.GUI_TREE_LEFT_MARGIN;
        if (this.plotState.accession_style === 'tree_simple') {
            return available_width / getTreeDepth(this.plotService
                                                      .phyloTree.tree);
        } else if (this.plotState.accession_style === 'tree_linear') {
            return available_width / getTreeDepthLinear(this.plotService
                                                            .phyloTree.tree);
        } else {
            // Should not happen
            return 0;
        }
    }

    private drawSimpleLabels(ctx: CanvasRenderingContext2D,
                             text_height: number, yoffset: number) {
        ctx.fillStyle = this.GUI_TREE_TEXT_COLOR;
        ctx.textBaseline = 'top';
        this.plotState.sorted_accessions.forEach((acc, index) => {
            ctx.fillText(this.plotService.getAccesionLabel(acc),
                         0, yoffset + index * text_height);
        });
    }

    private updateComponentWidth() {
        const ctx: CanvasRenderingContext2D = this.canvas.nativeElement
                                                         .getContext('2d');
        if (this.plotState.accession_style === 'labels') {
            // Rounding up to the bin width
            const bar_width = ceilTo(this.getMaxLabelWidth(ctx),
                                     this.plotService.bin_width);
            this.plotService.gui_margins.left = bar_width / this.plotService
                                                                .zoom_factor;
            this.canvas.nativeElement.width = bar_width;
        } else {
            // Rounding up to the bin width
            const bar_width = ceilTo(this.canvas.nativeElement
                                                .parentElement
                                                .parentElement
                                                .parentElement
                                                .offsetWidth
                                     * this.GUI_TREE_PLOT_PROPORTION,
                                     this.plotService.bin_width);
            this.canvas.nativeElement.width = bar_width;
            this.plotService.gui_margins.left = bar_width / this.plotService
                                                                .zoom_factor;
        }
    }

    private getMaxLabelWidth(ctx: CanvasRenderingContext2D) {
        ctx.font = `${this.plotService.bin_height}px ${this.GUI_TREE_FONT}`;
        return Math.max(
            ...this.plotState.sorted_accessions.map(acc =>
                ctx.measureText(this.plotService.getAccesionLabel(acc)).width
            )
        );
    }

    protected getPositionTarget(mouse_position: PlotPosition): PlotArea {
        const accession_index = Math.floor(mouse_position.y
                                           / this.plotService.bin_height)
                                - this.plotService.plot_position.y;
        if (accession_index >= this.plotService.row_num) {
            return { type: 'background' };
        }
        const accession = this.plotState.sorted_accessions[accession_index];
        const result: PlotAccession = {
            type: 'accession',
            accession_label: this.plotService.getAccesionLabel(accession),
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

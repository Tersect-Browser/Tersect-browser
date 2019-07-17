import { Component, ViewChild, ElementRef } from '@angular/core';
import { IntrogressionPlotService } from '../../services/introgression-plot.service';
import { PlotPosition, PlotAccession, PlotArea } from '../../models/PlotPosition';
import { TreeNode, getTreeDepth, getTreeDepthLinear } from '../../clustering/clustering';
import { ceilTo } from '../../utils/utils';
import { isNullOrUndefined } from 'util';
import { CanvasPlotElement, DragState } from '../CanvasPlotElement';

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

    constructor(private plotService: IntrogressionPlotService) { super(); }

    draw() {
        if (isNullOrUndefined(this.plotService.sorted_accessions)) { return; }

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
        if (this.plotService.accession_display === 'labels') {
            this.drawSimpleLabels(ctx, text_height, yoffset);
        } else {
            this.drawLabelTree(ctx, text_height, yoffset);
        }
    }

    private getEdgeLength(node: TreeNode): number {
        if (this.plotService.accession_display === 'tree_simple') {
            return 1;
        } else if (this.plotService.accession_display === 'tree_linear') {
            return node.length;
        } else {
            // Should not happen
            return 0;
        }
    }

    private _drawLabelTree(subtree: TreeNode, xpos: number,
                           ctx: CanvasRenderingContext2D,
                           background_width: number, text_height: number,
                           yoffset: number, scale: number,
                           draw_state: { current_row: number }) {
        const ypos = [ yoffset + draw_state.current_row * text_height ];

        if (subtree.children.length) {
            const top_xpos = xpos + this.getEdgeLength(subtree.children[0])
                                    * scale;

            this._drawLabelTree(subtree.children[0], top_xpos, ctx,
                                background_width, text_height, yoffset, scale,
                                draw_state);
            ypos.push(yoffset + draw_state.current_row * text_height);

            const bottom_xpos = xpos + this.getEdgeLength(subtree.children[1])
                                       * scale;

            this._drawLabelTree(subtree.children[1], bottom_xpos, ctx,
                                background_width, text_height, yoffset, scale,
                                draw_state);
            ypos.push(yoffset + draw_state.current_row * text_height);

            ctx.beginPath();
            ctx.lineWidth = this.GUI_TREE_LINE_WIDTH
                            * this.plotService.zoom_factor;
            ctx.strokeStyle = '#000000';
            ctx.setLineDash([]);
            ctx.moveTo(top_xpos, (ypos[0] + ypos[1]) / 2);
            ctx.lineTo(xpos, (ypos[0] + ypos[1]) / 2);
            ctx.lineTo(xpos, (ypos[1] + ypos[2]) / 2);
            ctx.lineTo(bottom_xpos, (ypos[1] + ypos[2]) / 2);
            ctx.stroke();
        } else {
            ctx.fillText(subtree.taxon.name, xpos, ypos[0]);
            ctx.beginPath();
            ctx.lineWidth = this.GUI_TREE_LINE_DASH_WIDTH
                            * this.plotService.zoom_factor;
            ctx.strokeStyle = this.GUI_TREE_LINE_DASH_STYLE;
            ctx.setLineDash(this.GUI_TREE_LINE_DASH.map(
                x => x * this.plotService.zoom_factor
            ));
            ctx.moveTo(xpos + ctx.measureText(subtree.taxon.name).width + 5,
                       ypos[0] + text_height / 2 - 0.5);
            ctx.lineTo(background_width, ypos[0] + text_height / 2 - 0.5);
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
        if (this.plotService.accession_display === 'tree_simple') {
            return available_width / getTreeDepth(this.plotService
                                                      .phyloTree.tree);
        } else if (this.plotService.accession_display === 'tree_linear') {
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
        this.plotService.sorted_accessions.forEach((label, index) => {
            ctx.fillText(label, 0, yoffset + index * text_height);
        });
    }

    private updateComponentWidth() {
        const ctx: CanvasRenderingContext2D = this.canvas.nativeElement
                                                         .getContext('2d');
        if (this.plotService.accession_display === 'labels') {
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
            ...this.plotService.sorted_accessions.map(label =>
                ctx.measureText(label).width
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
        const result: PlotAccession = {
            type: 'accession',
            accession: this.plotService.sorted_accessions[accession_index]
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

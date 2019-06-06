import { Component, ViewChild, ElementRef, Output, EventEmitter, OnInit } from '@angular/core';
import { IntrogressionPlotService } from '../../services/introgression-plot.service';
import { PlotPosition, PlotClickEvent, PlotHoverEvent, PlotBin, PlotAccession, PlotArea } from '../../models/PlotPosition';
import { TreeNode, getTreeDepth } from '../../clustering/clustering';
import { ceilTo } from '../../utils/utils';
import { isNullOrUndefined } from 'util';

@Component({
    selector: 'app-accession-bar',
    templateUrl: './accession-bar.component.html',
    styleUrls: ['./accession-bar.component.css']
})

export class AccessionBarComponent {
    @ViewChild('canvas') canvas: ElementRef;

    readonly GUI_TREE_BG_COLOR = '#FFFFFF';
    readonly GUI_TREE_FONT = 'Courier New';
    readonly GUI_TREE_TEXT_COLOR = '#000000';
    readonly GUI_TREE_STEP_WIDTH = 2;
    readonly GUI_TREE_LINE_WIDTH = 0.2;
    readonly GUI_TREE_LINE_DASH = [0.2, 0.2];
    readonly GUI_TREE_LINE_DASH_STYLE = 'rgba(0, 0, 0, 0.2)';
    readonly GUI_TREE_LINE_DASH_WIDTH = 0.2;

    /**
     * Delay (ms) before a tooltip appears.
     */
    readonly HOVER_DELAY: 200;

    /**
     * Timer used to delay emitting a hover event (used to display a tooltip).
     */
    private hover_timer: NodeJS.Timer;

    /**
     * Used to keep remember the position of a mouse press.
     * This is necessary to distinguish clicks (where the position doesn't
     * change between the press and release) from drags (where it does).
     */
    private mouse_down_position: PlotPosition = { x: 0, y: 0 };

    /**
     *  Used to keep track of the start position during dragging.
     */
    private drag_start_position = { x: 0, y: 0 };

    /**
     * True if plot is currently being dragged.
     */
    private dragging_plot = false;

    /**
     * Emitted when plot elements (accessions) are clicked.
     */
    @Output() plotClick = new EventEmitter<PlotClickEvent>();

    /**
     * Emitted when mouse hovers over a plot element.
     */
    @Output() plotHover = new EventEmitter<PlotHoverEvent>();

    constructor(private plotService: IntrogressionPlotService) {}

    set height(height: number) {
        this.canvas.nativeElement.height = height;
    }

    private prepareTooltip(event) {
        clearTimeout(this.hover_timer);
        const target = this.getPositionTarget({
            x: event.layerX, y: event.layerY
        });
        if (target.type !== 'background') {
            this.hover_timer = setTimeout(
                () => this.plotHover.emit({
                    x: event.clientX,
                    y: event.clientY,
                    target: target
                }),
                this.HOVER_DELAY
            );
        }
    }

    mouseMove(event) {
        this.prepareTooltip(event);
        if (this.dragging_plot) {
            this.dragPlot(event);
        }
    }

    mouseDown(event) {
        this.mouse_down_position = { x: event.layerX, y: event.layerY };
        const target = this.getPositionTarget(this.mouse_down_position);
        if (target.type === 'bin' || target.type === 'background'
            || (target.type === 'accession' && this.plotService.draw_tree)) {
            this.startDrag(event);
        }
    }

    mouseUp(event) {
        if (this.mouse_down_position.x === event.layerX
            && this.mouse_down_position.y === event.layerY) {
            const target = this.getPositionTarget(this.mouse_down_position);
            this.plotClick.emit({
                x: event.clientX,
                y: event.clientY,
                target: target,
            });
        }
        this.stopDrag(event);
    }

    private getPositionTarget(mouse_position: PlotPosition): PlotArea {
        const inner_position = {
            x: Math.floor(mouse_position.x / this.plotService.bin_width)
               - this.plotService.gui_margins.left
               - this.plotService.plot_position.x,
            y: Math.floor(mouse_position.y / this.plotService.bin_height)
               - this.plotService.plot_position.y
        };

        if (inner_position.x >= this.plotService.col_num
            || inner_position.y >= this.plotService.row_num) {
            const res_bg = { type: 'background' };
            return res_bg;
        }

        if (inner_position.x + this.plotService.plot_position.x < 0) {
            const res_acc: PlotAccession = {
                type: 'accession',
                accession: this.plotService.sorted_accessions[inner_position.y]
            };
            return res_acc;
        }

        const interval = this.plotService.interval;
        const binsize = this.plotService.binsize;

        const res_bin: PlotBin = {
            type: 'bin',
            accession: this.plotService.sorted_accessions[inner_position.y],
            start_position: interval[0] + inner_position.x * binsize,
            end_position: interval[0] + (inner_position.x + 1) * binsize - 1
        };
        return res_bin;
    }

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
        this.plotService.gui_margins.left = this.calcLabelsWidth(ctx,
                                                                 this.plotService
                                                                     .draw_tree);
        this.canvas.nativeElement.width = this.plotService.labels_width;

        // Need to set font again despite doing it in calcLabelsWidth since
        // changing width resets the context to its default state
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
        if (this.plotService.draw_tree) {
            this.drawLabelTree(ctx, text_height, yoffset);
        } else {
            this.drawSimpleLabels(ctx, text_height, yoffset);
        }
    }

    private _drawLabelTree(subtree: TreeNode, depth: number,
                           ctx: CanvasRenderingContext2D,
                           background_width: number, text_height: number,
                           yoffset: number,
                           draw_state: { current_row: number }) {
        const xpos = depth * this.GUI_TREE_STEP_WIDTH
                     * this.plotService.zoom_factor;
        const ypos = [ yoffset + draw_state.current_row * text_height ];

        if (subtree.children.length) {
            this._drawLabelTree(subtree.children[0], depth + 1, ctx,
                                background_width, text_height, yoffset,
                                draw_state);
            ypos.push(yoffset + draw_state.current_row * text_height);

            this._drawLabelTree(subtree.children[1], depth + 1, ctx,
                                background_width, text_height, yoffset,
                                draw_state);
            ypos.push(yoffset + draw_state.current_row * text_height);

            ctx.beginPath();
            ctx.lineWidth = this.GUI_TREE_LINE_WIDTH
                            * this.plotService.zoom_factor;
            ctx.strokeStyle = '#000000';
            ctx.setLineDash([]);
            ctx.moveTo(xpos + this.GUI_TREE_STEP_WIDTH
                              * this.plotService.zoom_factor,
                       (ypos[0] + ypos[1]) / 2);
            ctx.lineTo(xpos, (ypos[0] + ypos[1]) / 2);
            ctx.lineTo(xpos, (ypos[1] + ypos[2]) / 2);
            ctx.lineTo(xpos + this.GUI_TREE_STEP_WIDTH
                              * this.plotService.zoom_factor,
                       (ypos[1] + ypos[2]) / 2);
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
        this._drawLabelTree(this.plotService.njTree, 1, ctx,
                            this.plotService.labels_width,
                            text_height, yoffset, draw_state);
    }

    private drawSimpleLabels(ctx: CanvasRenderingContext2D,
                             text_height: number, yoffset: number) {
        ctx.fillStyle = this.GUI_TREE_TEXT_COLOR;
        ctx.textBaseline = 'top';
        this.plotService.sorted_accessions.forEach((label, index) => {
            ctx.fillText(label, 0, yoffset + index * text_height);
        });
    }

    private calcLabelsWidth(ctx: CanvasRenderingContext2D, tree: boolean) {
        ctx.font = `${this.plotService.bin_height}px ${this.GUI_TREE_FONT}`;
        const max_label_width = Math.max(
            ...this.plotService.sorted_accessions.map(label =>
                ctx.measureText(label).width
            )
        );
        let gui_left_width = max_label_width / this.plotService.zoom_factor;
        if (tree) {
            gui_left_width += (getTreeDepth(this.plotService.njTree) + 1)
                              * this.GUI_TREE_STEP_WIDTH;
        }
        return Math.ceil(gui_left_width);
    }

    private dragPlot(event) {
        if (event.buttons !== 1) {
            this.stopDrag(event);
            return;
        }
        if (this.canvas.nativeElement.style.cursor !== 'move') {
            this.canvas.nativeElement.style.cursor = 'move';
        }

        const new_pos: PlotPosition = {
            x: Math.round((event.layerX - this.drag_start_position.x)
                          / this.plotService.bin_width),
            y: Math.round((event.layerY - this.drag_start_position.y)
                          / this.plotService.bin_height)
        };

        if (new_pos.x > 0) {
            new_pos.x = 0;
        }
        if (new_pos.y > 0) {
            new_pos.y = 0;
        }

        this.plotService.updatePosition(new_pos);
    }

    private startDrag(event) {
        // drag on left mouse button
        if (event.buttons === 1) {
            this.dragging_plot = true;
            this.drag_start_position = {
                x: event.layerX - this.plotService.plot_position.x
                                  / this.plotService.bin_width,
                y: event.layerY - this.plotService.plot_position.y
                                  / this.plotService.bin_height
            };
        }
    }

    private stopDrag(event) {
        this.canvas.nativeElement.style.cursor = 'auto';
        this.dragging_plot = false;
    }

}

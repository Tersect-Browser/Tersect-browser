import { PlotPosition, PlotAccession, PlotArea } from '../../models/PlotPosition';
import { TreeNode, getTreeDepth, getTreeDepthLinear } from '../../clustering/clustering';
import { ceilTo, deepCopy, isNullOrUndefined } from '../../utils/utils';
import { CanvasPlotElement, DragState } from '../CanvasPlotElement';
import { IntrogressionPlotService } from '../services/introgression-plot.service';
import { PlotStateService } from '../services/plot-state.service';
import { TreeQuery } from '../../models/TreeQuery';
import { AccessionDisplayStyle, AccessionDictionary } from '../../introgression-browser/browser-settings';

import { Component, ViewChild, ElementRef, OnInit } from '@angular/core';
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
    @ViewChild('canvas', { static: true })
    private canvas: ElementRef;

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
    private dragStartIndex = 0;

    /**
     * The stored canvas height is limited due to browser-specific limits.
     * The image requires redrawing when the user scrolls past this limit.
     */
    readonly STORED_CANVAS_HEIGHT = 16000;

    /**
     * Step size used when vertically offsetting the stored canvas.
     */
    readonly STORED_CANVAS_OFFSET_STEP = ceilTo(this.STORED_CANVAS_HEIGHT / 2,
                                                this.plotService.binHeight);

    private storedState: StoredAccessionBarState = {
        canvas: undefined,
        canvas_yoffset: 0,
        accession_style: undefined,
        container_width: undefined,
        tree_query: undefined,
        zoom_level: undefined,
        accession_dictionary: undefined
    };

    get guiMargins() {
        return this.plotService.guiMargins;
    }

    constructor(private plotState: PlotStateService,
                private plotService: IntrogressionPlotService) { super(); }

    ngOnInit() {
        this.storedState.canvas = document.createElement('canvas');
        this.storedState.canvas.height = this.STORED_CANVAS_HEIGHT;
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
        return this.getContainerHeight() - this.guiMargins.top;
    }

    /**
     * Return the height of the stored canvas that overflows the visible area.
     * This represents a pre-drawn area available for scrolling. When this is
     * negative, more of the canvas needs to be drawn.
     */
    private getStoredOverflowHeight(): number {
        const yoffset = this.plotService.offsetY;
        return this.STORED_CANVAS_HEIGHT - this.getAccessionBarHeight()
               + yoffset - this.storedState.canvas_yoffset;
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
                this.storedState
                    .canvas_yoffset -= this.STORED_CANVAS_OFFSET_STEP;
                overflow = this.getStoredOverflowHeight();
            }
            return true;
        }
        if (overflow > this.STORED_CANVAS_HEIGHT
                        - this.getAccessionBarHeight()) {
            while (overflow > this.STORED_CANVAS_HEIGHT
                                - this.getAccessionBarHeight()) {
                this.storedState
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

        const containerWidth = this.getContainerWidth();
        if (isNullOrUndefined(this.storedState)
            || isNullOrUndefined(this.storedState.canvas)
            || this.storedState.zoom_level !== this.plotState.zoomLevel
            || this.storedState.accession_style
               !== this.plotState.accessionStyle
            || this.storedState.container_width !== containerWidth
            || !deepEqual(this.storedState.tree_query,
                          this.plotService.phenTree.query)
            || !deepEqual(this.storedState.accession_dictionary,
                          this.plotState.accessionDictionary)) {
            return true;
        }

        return false;
    }

    private updateImage() {
        const textHeight = this.plotService.binHeight;
        this.updateCanvasWidth(this.storedState.canvas);

        const ctx: CanvasRenderingContext2D = this.storedState
                                                  .canvas.getContext('2d');

        // Draw background
        ctx.fillStyle = this.GUI_TREE_BG_COLOR;
        ctx.fillRect(0, 0, this.plotService.accessionBarWidth,
                     this.storedState.canvas.height);

        // Draw labels
        ctx.font = `${textHeight}px ${this.GUI_TREE_FONT}`;
        if (this.plotState.accessionStyle === 'labels') {
            this.drawSimpleLabels(ctx);
        } else {
            this.drawLabelTree(ctx);
        }
        this.drawColorTracks(ctx);

        // Save current state
        this.storedState.accession_style = this.plotState.accessionStyle;
        this.storedState.container_width = this.getContainerWidth();
        this.storedState.tree_query = this.plotService.phenTree.query;
        this.storedState.zoom_level = this.plotState.zoomLevel;
        this.storedState
            .accession_dictionary = deepCopy(this.plotState
                                                 .accessionDictionary);
    }

    drawColorTracks(ctx: CanvasRenderingContext2D) {
        this.plotState.sortedAccessions.forEach((accId, rowIndex) => {
            const trackWidth = this.GUI_TREE_COLOR_TRACK_WIDTH
                               * this.plotService.binWidth;
            const colors = this.plotService.getAccessionColors(accId);
            colors.forEach((col, j) => {
                const xpos = this.storedState.canvas.width
                             - (j + 1) * trackWidth;
                const ypos = rowIndex * this.plotService.binHeight;
                ctx.fillStyle = col;
                ctx.fillRect(xpos, ypos, trackWidth,
                             this.plotService.binHeight);
            });
        });
    }

    draw() {
        if (isNullOrUndefined(this.plotState.sortedAccessions)) { return; }

        if (this.updateRequired()) {
            this.updateImage();
        }

        this.canvas.nativeElement.height = this.getContainerHeight();
        const ctx: CanvasRenderingContext2D = this.canvas.nativeElement
                                                         .getContext('2d');
        ctx.clearRect(0, 0, this.canvas.nativeElement.width,
                      this.canvas.nativeElement.height);

        ctx.drawImage(this.storedState.canvas, 0,
                      this.plotService.offsetY
                      - this.storedState.canvas_yoffset);
    }

    private getEdgeLength(node: TreeNode): number {
        if (this.plotState.accessionStyle === 'tree_simple') {
            return 1;
        } else if (this.plotState.accessionStyle === 'tree_linear') {
            return node.length;
        } else {
            // Should not happen
            return 0;
        }
    }

    private _drawLabelTree(subtree: TreeNode, basePosX: number,
                           ctx: CanvasRenderingContext2D,
                           backgroundWidth: number, textHeight: number,
                           yoffset: number, scale: number,
                           drawState: { current_row: number }) {
        let prevPosY = yoffset + drawState.current_row * textHeight;
        const subtreePosX = [];
        const subtreePosY = [];

        if (subtree.children.length) {
            subtree.children.forEach(child => {
                const childPosX = basePosX + this.getEdgeLength(child)
                                               * scale;
                this._drawLabelTree(child, childPosX, ctx,
                                    backgroundWidth, textHeight,
                                    yoffset, scale,
                                    drawState);
                subtreePosX.push(childPosX);
                const curPosY = yoffset + drawState.current_row * textHeight;
                subtreePosY.push((prevPosY + curPosY) / 2);
                prevPosY = curPosY;
            });

            ctx.beginPath();
            ctx.lineWidth = this.GUI_TREE_LINE_WIDTH
                            * this.plotService.zoomFactor;
            ctx.strokeStyle = '#000000';
            ctx.setLineDash([]);

            // Vertical line (from center of first to center of second subtrees)
            ctx.moveTo(basePosX, subtreePosY[0]);
            ctx.lineTo(basePosX, subtreePosY[subtreePosY.length - 1]);

            // Horizontal lines to individual subtrees
            subtreePosX.forEach((childPosX, i) => {
                ctx.moveTo(basePosX, subtreePosY[i]);
                ctx.lineTo(childPosX, subtreePosY[i]);
            });
            ctx.stroke();
        } else {
            const label = this.plotService
                              .getAccessionLabel(subtree.taxon.name);
            ctx.fillText(label, basePosX, prevPosY);
            ctx.beginPath();
            ctx.lineWidth = this.GUI_TREE_LINE_DASH_WIDTH
                            * this.plotService.zoomFactor;
            ctx.strokeStyle = this.GUI_TREE_LINE_DASH_STYLE;
            ctx.setLineDash(this.GUI_TREE_LINE_DASH.map(
                x => x * this.plotService.zoomFactor
            ));
            ctx.moveTo(basePosX + ctx.measureText(label).width + 5,
                       prevPosY + textHeight / 2 - 0.5);
            ctx.lineTo(backgroundWidth, prevPosY + textHeight / 2 - 0.5);
            ctx.stroke();
            drawState.current_row++;
        }
    }

    private drawLabelTree(ctx: CanvasRenderingContext2D) {
        const textHeight = this.plotService.binHeight;
        ctx.fillStyle = this.GUI_TREE_TEXT_COLOR;
        ctx.textBaseline = 'top';
        const drawState = { current_row: 0 };

        const scale = this.getTreeScale(ctx);

        const initialPosX = this.GUI_TREE_LEFT_MARGIN;
        this._drawLabelTree(this.plotService.phenTree.tree, initialPosX, ctx,
                            this.plotService.accessionBarWidth,
                            textHeight, this.storedState.canvas_yoffset,
                            scale, drawState);
    }

    private getTreeScale(ctx: CanvasRenderingContext2D): number {
        const availableWidth = this.storedState.canvas.width
                               - this.getMaxLabelWidth(ctx)
                               - this.getColorTracksWidth()
                               - this.plotService.binWidth
                               - this.GUI_TREE_LEFT_MARGIN;
        if (this.plotState.accessionStyle === 'tree_simple') {
            return availableWidth / getTreeDepth(this.plotService
                                                     .phenTree.tree);
        } else if (this.plotState.accessionStyle === 'tree_linear') {
            return availableWidth / getTreeDepthLinear(this.plotService
                                                           .phenTree.tree);
        } else {
            // Should not happen
            return 0;
        }
    }

    private drawSimpleLabels(ctx: CanvasRenderingContext2D) {
        const textHeight = this.plotService.binHeight;
        ctx.fillStyle = this.GUI_TREE_TEXT_COLOR;
        ctx.textBaseline = 'top';
        this.plotState.sortedAccessions.forEach((acc, index) => {
            ctx.fillText(this.plotService.getAccessionLabel(acc), 0,
                         index * textHeight + this.storedState.canvas_yoffset);
        });
    }

    private updateCanvasWidth(canvas: HTMLCanvasElement) {
        const ctx: CanvasRenderingContext2D = canvas.getContext('2d');
        let width: number;
        if (this.plotState.accessionStyle === 'labels') {
            width = ceilTo(this.getMaxLabelWidth(ctx)
                           + this.getColorTracksWidth(),
                           this.plotService.binWidth);
        } else {
            width = ceilTo(this.getContainerWidth()
                           * this.GUI_TREE_PLOT_PROPORTION,
                           this.plotService.binWidth);
        }
        canvas.width = width;
        this.canvas.nativeElement.width = width;
        this.plotService.guiMargins.left = width / this.plotService.zoomFactor;
    }

    /**
     * Get the total width of the group color tracks.
     */
    private getColorTracksWidth() {
        return this.GUI_TREE_COLOR_TRACK_WIDTH
               * this.plotService.getMaxColorCount()
               * this.plotService.binWidth;
    }

    private getMaxLabelWidth(ctx: CanvasRenderingContext2D) {
        ctx.font = `${this.plotService.binHeight}px ${this.GUI_TREE_FONT}`;
        return Math.max(
            ...this.plotState.sortedAccessions.map(acc =>
                ctx.measureText(this.plotService.getAccessionLabel(acc)).width
            )
        );
    }

    protected getPositionTarget(mousePosition: PlotPosition): PlotArea {
        if (isNullOrUndefined(this.plotState.sortedAccessions)) {
            return { type: 'background' };
        }
        const accessionIndex = Math.floor(mousePosition.y
                                          / this.plotService.binHeight)
                               - this.plotService.plotPosition.y;
        if (accessionIndex >= this.plotService.rowNum) {
            return { type: 'background' };
        }
        const accession = this.plotState.sortedAccessions[accessionIndex];
        const result: PlotAccession = {
            type: 'accession',
            accession_label: this.plotService.getAccessionLabel(accession),
            accession: accession
        };
        return result;
    }

    protected dragStartAction(dragState: DragState): void {
        // Dragging 'rounded' to accession index.
        this.dragStartIndex = dragState.start_position.y
                              / this.plotService.binHeight
                              - this.plotService.plotPosition.y;
    }

    protected dragStopAction(dragState: DragState): void {
        // No action
    }

    protected dragAction(dragState: DragState): void {
        // Only vertical dragging, rounded to accession indices.
        const newPos: PlotPosition = {
            x: this.plotService.plotPosition.x,
            y: Math.round(dragState.current_position.y
                          / this.plotService.binHeight
                          - this.dragStartIndex)
        };

        if (newPos.y > 0) {
            newPos.y = 0;
        }

        this.plotService.updatePosition(newPos);
    }
}

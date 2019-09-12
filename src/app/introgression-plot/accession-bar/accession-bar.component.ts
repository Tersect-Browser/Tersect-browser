import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import * as deepEqual from 'fast-deep-equal';

import {
    getTreeDepth,
    getTreeDepthLinear,
    TreeNode
} from '../../clustering/clustering';
import {
    AccessionDictionary,
    AccessionDisplayStyle
} from '../../introgression-browser/browser-settings';
import {
    PlotAccession,
    PlotArea,
    PlotPosition
} from '../../models/PlotPosition';
import {
    TreeQuery
} from '../../models/TreeQuery';
import {
    ceilTo,
    deepCopy,
    isNullOrUndefined
} from '../../utils/utils';
import {
    CanvasPlotElement,
    DragState
} from '../CanvasPlotElement';
import {
    IntrogressionPlotService
} from '../services/introgression-plot.service';
import {
    PlotStateService
} from '../services/plot-state.service';

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
    static readonly GUI_TREE_BG_COLOR = '#FFFFFF';
    static readonly GUI_TREE_FONT = 'Courier New';
    static readonly GUI_TREE_TEXT_COLOR = '#000000';
    static readonly GUI_TREE_STEP_WIDTH = 2;
    static readonly GUI_TREE_LINE_WIDTH = 0.2;
    static readonly GUI_TREE_LINE_DASH = [0.2, 0.2];
    static readonly GUI_TREE_LINE_DASH_STYLE = 'rgba(0, 0, 0, 0.2)';
    static readonly GUI_TREE_LINE_DASH_WIDTH = 0.2;
    static readonly GUI_TREE_LEFT_MARGIN = 5;

    /**
     * Width of the color tracks in multiples of the bin width.
     */
    static readonly GUI_TREE_COLOR_TRACK_WIDTH = 2;

    /* Proportion of the width of the plot taken up by accession trees. This
     * should be half of the screen by default.
     */
    static readonly GUI_TREE_PLOT_PROPORTION = 0.5;

    /**
     * The stored canvas height is limited due to browser-specific limits.
     * The image requires redrawing when the user scrolls past this limit.
     */
    static readonly STORED_CANVAS_HEIGHT = 16000;

    @ViewChild('canvas', { static: true })
    private readonly canvas: ElementRef;

    /**
     * Drag start position in terms of accession index.
     */
    private dragStartIndex = 0;

    /**
     * Step size used when vertically offsetting the stored canvas.
     */
    private readonly STORED_CANVAS_OFFSET_STEP = ceilTo(AccessionBarComponent.STORED_CANVAS_HEIGHT / 2,
                                                        this.plotService.binHeight);

    private readonly storedState: StoredAccessionBarState = {
        canvas: undefined,
        canvas_yoffset: 0,
        accession_style: undefined,
        container_width: undefined,
        tree_query: undefined,
        zoom_level: undefined,
        accession_dictionary: undefined
    };

    constructor(private readonly plotState: PlotStateService,
                private readonly plotService: IntrogressionPlotService) {
        super();
    }

    get guiMargins() {
        return this.plotService.guiMargins;
    }

    ngOnInit() {
        this.storedState.canvas = document.createElement('canvas');
        this.storedState.canvas.height = AccessionBarComponent.STORED_CANVAS_HEIGHT;
    }

    draw() {
        if (isNullOrUndefined(this.plotState.sortedAccessions)) { return; }

        if (this.isUpdateRequired()) {
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

    protected dragStartAction(dragState: DragState): void {
        // Dragging 'rounded' to accession index.
        this.dragStartIndex = dragState.start_position.y
                              / this.plotService.binHeight
                              - this.plotService.plotPosition.y;
    }

    protected dragStopAction(dragState: DragState): void {
        // No action
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

    private drawColorTracks(ctx: CanvasRenderingContext2D) {
        this.plotState.sortedAccessions.forEach((accId, rowIndex) => {
            const trackWidth = AccessionBarComponent.GUI_TREE_COLOR_TRACK_WIDTH
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

    private getAccessionBarHeight(): number {
        return this.getContainerHeight() - this.guiMargins.top;
    }

    private getContainerHeight(): number {
        return this.canvas.nativeElement
                          .parentElement
                          .parentElement
                          .parentElement
                          .offsetHeight;
    }

    private getContainerWidth(): number {
        return this.canvas.nativeElement
                          .parentElement
                          .parentElement
                          .parentElement
                          .offsetWidth;
    }

    /**
     * Return the height of the stored canvas that overflows the visible area.
     * This represents a pre-drawn area available for scrolling. When this is
     * negative, more of the canvas needs to be drawn.
     */
    private getStoredOverflowHeight(): number {
        const yoffset = this.plotService.offsetY;
        return AccessionBarComponent.STORED_CANVAS_HEIGHT
               - this.getAccessionBarHeight()
               + yoffset - this.storedState.canvas_yoffset;
    }

    private drawLabelTree(ctx: CanvasRenderingContext2D) {
        const textHeight = this.plotService.binHeight;
        ctx.fillStyle = AccessionBarComponent.GUI_TREE_TEXT_COLOR;
        ctx.textBaseline = 'top';
        const drawState = { current_row: 0 };

        const scale = this.getTreeScale(ctx);

        const initialPosX = AccessionBarComponent.GUI_TREE_LEFT_MARGIN;
        this._drawLabelTree(this.plotService.phenTree.tree, initialPosX, ctx,
                            this.plotService.accessionBarWidth,
                            textHeight, this.storedState.canvas_yoffset,
                            scale, drawState);
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
            ctx.lineWidth = AccessionBarComponent.GUI_TREE_LINE_WIDTH
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
            ctx.lineWidth = AccessionBarComponent.GUI_TREE_LINE_DASH_WIDTH
                            * this.plotService.zoomFactor;
            ctx.strokeStyle = AccessionBarComponent.GUI_TREE_LINE_DASH_STYLE;
            ctx.setLineDash(AccessionBarComponent.GUI_TREE_LINE_DASH.map(
                x => x * this.plotService.zoomFactor
            ));
            ctx.moveTo(basePosX + ctx.measureText(label).width + 5,
                       prevPosY + textHeight / 2 - 0.5);
            ctx.lineTo(backgroundWidth, prevPosY + textHeight / 2 - 0.5);
            ctx.stroke();
            drawState.current_row++;
        }
    }

    private drawSimpleLabels(ctx: CanvasRenderingContext2D) {
        const textHeight = this.plotService.binHeight;
        ctx.fillStyle = AccessionBarComponent.GUI_TREE_TEXT_COLOR;
        ctx.textBaseline = 'top';
        this.plotState.sortedAccessions.forEach((acc, index) => {
            ctx.fillText(this.plotService.getAccessionLabel(acc), 0,
                         index * textHeight + this.storedState.canvas_yoffset);
        });
    }

    /**
     * Get the total width of the group color tracks.
     */
    private getColorTracksWidth() {
        return AccessionBarComponent.GUI_TREE_COLOR_TRACK_WIDTH
               * this.plotService.getMaxColorCount()
               * this.plotService.binWidth;
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

    private getMaxLabelWidth(ctx: CanvasRenderingContext2D) {
        ctx.font = `${this.plotService.binHeight}px ${AccessionBarComponent.GUI_TREE_FONT}`;
        return Math.max(
            ...this.plotState.sortedAccessions.map(acc =>
                ctx.measureText(this.plotService.getAccessionLabel(acc)).width
            )
        );
    }

    private getTreeScale(ctx: CanvasRenderingContext2D): number {
        const availableWidth = this.storedState.canvas.width
                               - this.getMaxLabelWidth(ctx)
                               - this.getColorTracksWidth()
                               - this.plotService.binWidth
                               - AccessionBarComponent.GUI_TREE_LEFT_MARGIN;
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

    /**
     * Return true if stored canvas requires redrawing due to scrolling.
     * Note: this method applies the required vertical offset to the stored
     * canvas as a side-effect.
     */
    private isScrollUpdateRequired(): boolean {
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
        if (overflow > AccessionBarComponent.STORED_CANVAS_HEIGHT
                       - this.getAccessionBarHeight()) {
            while (overflow > AccessionBarComponent.STORED_CANVAS_HEIGHT
                              - this.getAccessionBarHeight()) {
                this.storedState
                    .canvas_yoffset += this.STORED_CANVAS_OFFSET_STEP;
                overflow = this.getStoredOverflowHeight();
            }
            return true;
        }
        return false;
    }

    private isUpdateRequired(): boolean {
        if (this.isScrollUpdateRequired()) {
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

    private updateCanvasWidth(canvas: HTMLCanvasElement) {
        const ctx: CanvasRenderingContext2D = canvas.getContext('2d');
        let width: number;
        if (this.plotState.accessionStyle === 'labels') {
            width = ceilTo(this.getMaxLabelWidth(ctx)
                           + this.getColorTracksWidth(),
                           this.plotService.binWidth);
        } else {
            width = ceilTo(this.getContainerWidth()
                           * AccessionBarComponent.GUI_TREE_PLOT_PROPORTION,
                           this.plotService.binWidth);
        }
        canvas.width = width;
        this.canvas.nativeElement.width = width;
        this.plotService.guiMargins.left = width / this.plotService.zoomFactor;
    }

    private updateImage() {
        const textHeight = this.plotService.binHeight;
        this.updateCanvasWidth(this.storedState.canvas);

        const ctx: CanvasRenderingContext2D = this.storedState
                                                  .canvas.getContext('2d');

        // Draw background
        ctx.fillStyle = AccessionBarComponent.GUI_TREE_BG_COLOR;
        ctx.fillRect(0, 0, this.plotService.accessionBarWidth,
                     this.storedState.canvas.height);

        // Draw labels
        ctx.font = `${textHeight}px ${AccessionBarComponent.GUI_TREE_FONT}`;
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
}

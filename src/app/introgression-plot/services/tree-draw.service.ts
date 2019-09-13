import { Injectable } from '@angular/core';

import {
    getTreeDepth,
    getTreeDepthLinear,
    TreeNode
} from '../../clustering/clustering';
import {
    ceilTo,
    isNullOrUndefined
} from '../../utils/utils';
import {
    AccessionTreeView,
    ContainerSize
} from './accession-tree-view';
import {
    IntrogressionPlotService
} from './introgression-plot.service';
import {
    PlotStateService
} from './plot-state.service';

@Injectable()
export class TreeDrawService {
    static readonly TREE_BG_COLOR = '#FFFFFF';

    /**
     * Width of the color tracks in multiples of the bin width.
     */
    static readonly TREE_COLOR_TRACK_WIDTH = 2;

    static readonly TREE_FONT = 'Courier New';
    static readonly TREE_FONT_COLOR = '#000000';

    static readonly TREE_LEFT_MARGIN = 5;

    static readonly TREE_LINE_DASH = [0.2, 0.2];
    static readonly TREE_LINE_DASH_STYLE = 'rgba(0, 0, 0, 0.2)';
    static readonly TREE_LINE_DASH_WIDTH = 0.2;
    static readonly TREE_LINE_WIDTH = 0.2;

    /* Proportion of the width of the plot taken up by accession trees. This
     * should be half of the screen by default.
     */
    static readonly TREE_PLOT_PROPORTION = 0.5;

    constructor(private readonly plotState: PlotStateService,
                private readonly plotService: IntrogressionPlotService) { }

    createTreeView(containerSize: ContainerSize,
                   zoomLevel?: number): AccessionTreeView {
        const zoom = isNullOrUndefined(zoomLevel) ? this.plotState.zoomLevel
                                                  : zoomLevel;
        return new AccessionTreeView(this.plotState.accessionDictionary,
                                     this.plotState.accessionStyle,
                                     this.plotService.phenTree.query,
                                     this.plotService.offsetY,
                                     containerSize, zoom,
                                     this.plotService.binHeight);
    }

    drawTree(targetCanvas: HTMLCanvasElement, treeView: AccessionTreeView,
             containerSize: ContainerSize, zoomLevel?: number) {
        const zoom = isNullOrUndefined(zoomLevel) ? this.plotState.zoomLevel
                                                  : zoomLevel;
        treeView.update(this.plotState.accessionDictionary,
                        this.plotState.accessionStyle,
                        this.plotService.phenTree.query,
                        this.plotService.offsetY,
                        containerSize,
                        zoom);
        if (treeView.redrawRequired) {
            this.updateCanvasWidth(targetCanvas, treeView.viewCanvas,
                                   containerSize);
            this.generateTree(treeView);
            treeView.redrawRequired = false;
        }

        targetCanvas.height = containerSize.height;
        const ctx: CanvasRenderingContext2D = targetCanvas.getContext('2d');
        ctx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
        ctx.drawImage(treeView.viewCanvas, 0,
                      this.plotService.offsetY - treeView.canvasOffsetY);
    }

    private drawColorTracks(ctx: CanvasRenderingContext2D,
                            treeView: AccessionTreeView) {
        this.plotState.sortedAccessions.forEach((accId, rowIndex) => {
            const trackWidth = TreeDrawService.TREE_COLOR_TRACK_WIDTH
                               * this.plotService.binWidth;
            const colors = this.plotService.getAccessionColors(accId);
            colors.forEach((col, j) => {
                const xpos = treeView.viewCanvas.width - (j + 1) * trackWidth;
                const ypos = rowIndex * this.plotService.binHeight;
                ctx.fillStyle = col;
                ctx.fillRect(xpos, ypos, trackWidth,
                             this.plotService.binHeight);
            });
        });
    }

    private drawLabelTree(ctx: CanvasRenderingContext2D,
                          treeView: AccessionTreeView) {
        const textHeight = this.plotService.binHeight;
        ctx.fillStyle = TreeDrawService.TREE_FONT_COLOR;
        ctx.textBaseline = 'top';
        const drawState = { current_row: 0 };

        const scale = this.getTreeScale(ctx, treeView);

        const initialPosX = TreeDrawService.TREE_LEFT_MARGIN;
        this._drawLabelTree(this.plotService.phenTree.tree, initialPosX, ctx,
                            this.plotService.accessionBarWidth,
                            textHeight, treeView.canvasOffsetY,
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
                const childPosX = basePosX + this.getEdgeLength(child) * scale;
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
            ctx.lineWidth = TreeDrawService.TREE_LINE_WIDTH
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
            ctx.lineWidth = TreeDrawService.TREE_LINE_DASH_WIDTH
                            * this.plotService.zoomFactor;
            ctx.strokeStyle = TreeDrawService.TREE_LINE_DASH_STYLE;
            ctx.setLineDash(TreeDrawService.TREE_LINE_DASH.map(
                x => x * this.plotService.zoomFactor
            ));
            ctx.moveTo(basePosX + ctx.measureText(label).width + 5,
                       prevPosY + textHeight / 2 - 0.5);
            ctx.lineTo(backgroundWidth, prevPosY + textHeight / 2 - 0.5);
            ctx.stroke();
            drawState.current_row++;
        }
    }

    private drawSimpleLabels(ctx: CanvasRenderingContext2D,
                             treeView: AccessionTreeView) {
        const textHeight = this.plotService.binHeight;
        ctx.fillStyle = TreeDrawService.TREE_FONT_COLOR;
        ctx.textBaseline = 'top';
        this.plotState.sortedAccessions.forEach((acc, index) => {
            ctx.fillText(this.plotService.getAccessionLabel(acc), 0,
                         index * textHeight + treeView.canvasOffsetY);
        });
    }

    private generateTree(treeView: AccessionTreeView) {
        const ctx: CanvasRenderingContext2D = treeView.viewCanvas
                                                      .getContext('2d');
        // Draw background
        ctx.fillStyle = TreeDrawService.TREE_BG_COLOR;
        ctx.fillRect(0, 0, this.plotService.accessionBarWidth,
                     treeView.viewCanvas.height);

        // Draw labels
        const fontSize = this.plotService.binHeight;
        ctx.font = `${fontSize}px ${TreeDrawService.TREE_FONT}`;
        if (this.plotState.accessionStyle === 'labels') {
            this.drawSimpleLabels(ctx, treeView);
        } else {
            this.drawLabelTree(ctx, treeView);
        }
        this.drawColorTracks(ctx, treeView);
    }

    /**
     * Get the total width of the group color tracks.
     */
    private getColorTracksWidth() {
        return TreeDrawService.TREE_COLOR_TRACK_WIDTH
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
        const fontSize = this.plotService.binHeight;
        ctx.font = `${fontSize}px ${TreeDrawService.TREE_FONT}`;
        return Math.max(
            ...this.plotState.sortedAccessions.map(acc =>
                ctx.measureText(this.plotService.getAccessionLabel(acc)).width
            )
        );
    }

    private getTreeScale(ctx: CanvasRenderingContext2D,
                         treeView: AccessionTreeView): number {
        const availableWidth = treeView.viewCanvas.width
                               - this.getMaxLabelWidth(ctx)
                               - this.getColorTracksWidth()
                               - this.plotService.binWidth
                               - TreeDrawService.TREE_LEFT_MARGIN;
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

    private updateCanvasWidth(targetCanvas: HTMLCanvasElement,
                              viewCanvas: HTMLCanvasElement,
                              containerSize: ContainerSize) {
        const ctx: CanvasRenderingContext2D = viewCanvas.getContext('2d');
        let width: number;
        if (this.plotState.accessionStyle === 'labels') {
            width = ceilTo(this.getMaxLabelWidth(ctx)
                           + this.getColorTracksWidth(),
                           this.plotService.binWidth);
        } else {
            width = ceilTo(containerSize.width
                           * TreeDrawService.TREE_PLOT_PROPORTION,
                           this.plotService.binWidth);
        }
        viewCanvas.width = width;
        targetCanvas.width = width;
        this.plotService.guiMargins.left = width / this.plotService.zoomFactor;
    }
}

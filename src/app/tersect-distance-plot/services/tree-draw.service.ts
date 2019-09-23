import { Injectable } from '@angular/core';

import {
    ceilTo,
    formatCanvasFont,
    isNullOrUndefined
} from '../../shared/utils/utils';
import {
    getAccessionColors,
    getAccessionLabel
} from '../../tersect-browser/browser-settings';
import {
    getTreeDepth,
    getTreeDepthLinear,
    TreeNode
} from '../clustering/clustering';
import {
    AccessionTreeView
} from '../models/AccessionTreeView';
import {
    ContainerSize
} from '../tersect-distance-plot.component';

@Injectable({
    providedIn: 'root'
})
export class TreeDrawService {
    static readonly TREE_BG_COLOR = '#FFFFFF';

    static readonly TREE_FONT = 'Courier New';
    static readonly TREE_FONT_COLOR = '#000000';

    static readonly TREE_LEFT_MARGIN = 5;

    static readonly TREE_LINE_DASH = [0.1, 0.1];
    static readonly TREE_LINE_DASH_STYLE = 'rgba(0, 0, 0, 0.2)';
    static readonly TREE_LINE_DASH_WIDTH = 0.1;
    static readonly TREE_LINE_WIDTH = 0.1;

    /* Proportion of the width of the plot taken up by accession trees. This
     * should be half of the screen by default.
     */
    static readonly TREE_PLOT_PROPORTION = 0.5;

    drawTree(treeView: AccessionTreeView, offsetX: number, offsetY: number,
             containerSize: ContainerSize, targetCanvas?: HTMLCanvasElement) {
        if (treeView.redrawRequired) {
            this.updateCanvasWidth(treeView, containerSize);
            this.generateTree(treeView);
        }

        if (!isNullOrUndefined(targetCanvas)) {
            targetCanvas.height = containerSize.height;
            targetCanvas.width = treeView.offscreenCanvas.width;

            const ctx: CanvasRenderingContext2D = targetCanvas.getContext('2d');
            ctx.clearRect(0, 0, treeView.offscreenCanvas.width,
                          treeView.offscreenCanvas.height);
            ctx.drawImage(treeView.offscreenCanvas, offsetX,
                          offsetY - treeView.canvasOffsetY);
        }
    }

    private drawColorTracks(ctx: CanvasRenderingContext2D,
                            treeView: AccessionTreeView) {
       treeView.orderedAccessions.forEach((accId, rowIndex) => {
            const colors = getAccessionColors(treeView.accessionDictionary,
                                              accId);
            colors.forEach((col, j) => {
                const xpos = treeView.offscreenCanvas.width
                             - (j + 1) * treeView.colorTrackWidth;
                const ypos = rowIndex * treeView.textSize;
                ctx.fillStyle = col;
                ctx.fillRect(xpos, ypos, treeView.colorTrackWidth,
                             treeView.textSize);
            });
        });
    }

    private drawLabelTree(ctx: CanvasRenderingContext2D,
                          treeView: AccessionTreeView) {
        ctx.fillStyle = TreeDrawService.TREE_FONT_COLOR;
        ctx.textBaseline = 'top';
        const drawState = { currentRow: 0 };

        const scale = this.getTreeScale(ctx, treeView);

        const initialPosX = TreeDrawService.TREE_LEFT_MARGIN;
        this._drawLabelTree(treeView.tree.root, initialPosX,
                            ctx, treeView, treeView.canvasOffsetY,
                            scale, drawState);
    }

    private _drawLabelTree(subtree: TreeNode, basePosX: number,
                           ctx: CanvasRenderingContext2D,
                           treeView: AccessionTreeView,
                           yoffset: number, scale: number,
                           drawState: { currentRow: number }) {
        let prevPosY = yoffset + drawState.currentRow * treeView.textSize;
        const subtreePosX = [];
        const subtreePosY = [];

        if (subtree.children.length) {
            subtree.children.forEach(child => {
                const childPosX = this.getEdgeLength(child, treeView) * scale
                                  + basePosX;
                this._drawLabelTree(child, childPosX, ctx, treeView, yoffset,
                                    scale, drawState);
                subtreePosX.push(childPosX);
                const curPosY = drawState.currentRow * treeView.textSize
                                + yoffset;
                subtreePosY.push((prevPosY + curPosY) / 2);
                prevPosY = curPosY;
            });

            ctx.beginPath();
            ctx.lineWidth = TreeDrawService.TREE_LINE_WIDTH * treeView.textSize;
            ctx.strokeStyle = '#000000';
            ctx.setLineDash([]);

            // Vertical line (from center of first to center of second subtree)
            ctx.moveTo(basePosX, subtreePosY[0]);
            ctx.lineTo(basePosX, subtreePosY[subtreePosY.length - 1]);

            // Horizontal lines to individual subtrees
            subtreePosX.forEach((childPosX, i) => {
                ctx.moveTo(basePosX, subtreePosY[i]);
                ctx.lineTo(childPosX, subtreePosY[i]);
            });
            ctx.stroke();
        } else {
            const label = getAccessionLabel(treeView.accessionDictionary,
                                            subtree.taxon.name);
            ctx.fillText(label, basePosX, prevPosY);
            const textEndPos = basePosX + ctx.measureText(label).width + 5;
            this.drawTrailingLine(ctx, treeView, textEndPos,
                                  prevPosY + treeView.textSize / 2 - 0.5);
            drawState.currentRow++;
        }
    }

    private drawSimpleLabels(ctx: CanvasRenderingContext2D,
                             treeView: AccessionTreeView) {
        ctx.fillStyle = TreeDrawService.TREE_FONT_COLOR;
        ctx.textBaseline = 'top';
        treeView.orderedAccessions.forEach((acc, index) => {
            ctx.fillText(getAccessionLabel(treeView.accessionDictionary, acc),
                         0, index * treeView.textSize + treeView.canvasOffsetY);
        });
    }

    private drawTrailingLine(ctx: CanvasRenderingContext2D,
                             treeView: AccessionTreeView,
                             xStart: number, yPos: number) {
        ctx.beginPath();
        ctx.lineWidth = TreeDrawService.TREE_LINE_DASH_WIDTH
                        * treeView.textSize;
        ctx.strokeStyle = TreeDrawService.TREE_LINE_DASH_STYLE;
        ctx.setLineDash(TreeDrawService.TREE_LINE_DASH.map(
            x => x * treeView.textSize
        ));
        ctx.moveTo(xStart, yPos);
        ctx.lineTo(ctx.canvas.width, yPos);
        ctx.stroke();
    }

    private generateTree(treeView: AccessionTreeView) {
        const ctx: CanvasRenderingContext2D = treeView.offscreenCanvas
                                                      .getContext('2d');
        // Draw background
        ctx.fillStyle = TreeDrawService.TREE_BG_COLOR;
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        // Draw labels
        ctx.font = formatCanvasFont(treeView.textSize,
                                    TreeDrawService.TREE_FONT);

        if (treeView.accessionStyle === 'labels') {
            this.drawSimpleLabels(ctx, treeView);
        } else {
            this.drawLabelTree(ctx, treeView);
        }
        this.drawColorTracks(ctx, treeView);

        treeView.redrawRequired = false;
    }

    /**
     * Get the total width of the group color tracks.
     */
    private getColorTracksWidth(treeView: AccessionTreeView) {
        return treeView.colorTrackWidth * this.getMaxColorCount(treeView);
    }

    private getEdgeLength(node: TreeNode, treeView: AccessionTreeView): number {
        if (treeView.accessionStyle === 'tree_simple') {
            return 1;
        } else if (treeView.accessionStyle === 'tree_linear') {
            return node.length;
        } else {
            // Should not happen
            return 0;
        }
    }

    /**
     * Return highest number of colors assigned to an accession.
     */
    getMaxColorCount(treeView: AccessionTreeView): number {
        let count = 0;
        if (isNullOrUndefined(treeView.accessionDictionary)) {
            return 0;
        }
        Object.values(treeView.accessionDictionary).forEach(acc => {
            if ('colors' in acc && acc.colors.length > count) {
                count = acc.colors.length;
            }
        });
        return count;
    }

    private getMaxLabelWidth(ctx: CanvasRenderingContext2D,
                             treeView: AccessionTreeView) {
        ctx.font = formatCanvasFont(treeView.textSize,
                                    TreeDrawService.TREE_FONT);
        return Math.max(
            ...treeView.orderedAccessions.map(acc =>
                ctx.measureText(getAccessionLabel(treeView.accessionDictionary,
                                                  acc)).width
            )
        );
    }

    private getTreeScale(ctx: CanvasRenderingContext2D,
                         treeView: AccessionTreeView): number {
        const availableWidth = treeView.offscreenCanvas.width
                               - this.getMaxLabelWidth(ctx, treeView)
                               - this.getColorTracksWidth(treeView)
                               - TreeDrawService.TREE_LEFT_MARGIN;
        if (treeView.accessionStyle === 'tree_simple') {
            return availableWidth / getTreeDepth(treeView.tree.root);
        } else if (treeView.accessionStyle === 'tree_linear') {
            return availableWidth / getTreeDepthLinear(treeView.tree.root);
        } else {
            // Should not happen
            return 0;
        }
    }

    private updateCanvasWidth(treeView: AccessionTreeView,
                              containerSize: ContainerSize) {
        const ctx: CanvasRenderingContext2D = treeView.offscreenCanvas
                                                      .getContext('2d');
        let width: number;
        // Rounding width to multiple of text size
        if (treeView.accessionStyle === 'labels') {
            width = ceilTo(this.getMaxLabelWidth(ctx, treeView)
                           + this.getColorTracksWidth(treeView),
                           treeView.textSize);
        } else {
            width = ceilTo(containerSize.width
                           * TreeDrawService.TREE_PLOT_PROPORTION,
                           treeView.textSize);
        }
        treeView.offscreenCanvas.width = width;
    }
}

import * as deepEqual from 'fast-deep-equal';

import {
    AccessionDictionary,
    AccessionDisplayStyle
} from '../components/tersect-distance-plot/models/PlotState';
import {
    ContainerSize
} from '../components/tersect-distance-plot/tersect-distance-plot.component';
import {
    treeToOrderedList
} from '../components/tersect-distance-plot/utils/clustering';
import {
    ceilTo,
    deepCopy,
    isNullOrUndefined
} from '../utils/utils';
import {
    PheneticTree
} from './PheneticTree';

export class AccessionTreeView {
    /**
     * Default tree container view width in pixels.
     */
    static readonly DEFAULT_CONTAINER_WIDTH = 600;

    /**
     * The stored canvas height is limited due to browser-specific limits.
     * The image requires redrawing when the user scrolls past this limit.
     */
    static readonly STORED_CANVAS_HEIGHT = 16000;

    /**
     * Step size used when vertically offsetting the stored canvas,
     * as a proportion of STORED_CANVAS_HEIGHT.
     */
    static readonly STORED_CANVAS_OFFSET_STEP = 0.5;

    offscreenCanvas: HTMLCanvasElement;
    redrawRequired: boolean;

    private _accessionDictionary: AccessionDictionary;
    private _accessionStyle: AccessionDisplayStyle;
    private _canvasOffsetY: number;
    private _colorTrackWidth: number;
    private _containerSize: ContainerSize;
    private _orderedAccessions: string[];
    private _textSize: number;
    private _tree: PheneticTree;

    constructor(tree: PheneticTree,
                orderedAccessions: string[],
                textSize: number,
                containerSize?: ContainerSize) {
        this.tree = tree;
        this.orderedAccessions = orderedAccessions;
        this.textSize = textSize;

        if (!isNullOrUndefined(containerSize)) {
            this.containerSize = containerSize;
        } else {
            this.containerSize = {
                width: AccessionTreeView.DEFAULT_CONTAINER_WIDTH,
                height: this.accessionCount * this.textSize
            };
        }

        this.accessionStyle = 'tree_linear';
        this.canvasOffsetY = 0;
        this.colorTrackWidth = textSize;

        this.offscreenCanvas = document.createElement('canvas');
        this.offscreenCanvas.height = AccessionTreeView.STORED_CANVAS_HEIGHT;

        this.redrawRequired = true;
    }

    get accessionCount(): number {
        return this.orderedAccessions.length;
    }

    set accessionDictionary(accessionDictionary: AccessionDictionary) {
        if (isNullOrUndefined(this._accessionDictionary)
            || !deepEqual(accessionDictionary, this._accessionDictionary)) {
            this._accessionDictionary = deepCopy(accessionDictionary);
            this.redrawRequired = true;
        }
    }
    get accessionDictionary(): AccessionDictionary {
        return this._accessionDictionary;
    }

    set accessionStyle(accessionStyle: AccessionDisplayStyle) {
        if (isNullOrUndefined(this._accessionStyle)
            || accessionStyle !== this._accessionStyle) {
            this._accessionStyle = accessionStyle;
            this.redrawRequired = true;
        }
    }
    get accessionStyle(): AccessionDisplayStyle {
        return this._accessionStyle;
    }

    set canvasOffsetY(canvasOffsetY: number) {
        if (isNullOrUndefined(this._canvasOffsetY)) {
            this._canvasOffsetY = canvasOffsetY;
            this.redrawRequired = true;
        } else if (!this.isVisibleAreaDrawn(canvasOffsetY,
                                            this.containerSize)) {
            this.updateOffset(canvasOffsetY, this.containerSize);
            this.redrawRequired = true;
        }
    }
    get canvasOffsetY(): number {
        return this._canvasOffsetY;
    }

    set colorTrackWidth(colorTrackWidth: number) {
        if (isNullOrUndefined(this._colorTrackWidth)
            || colorTrackWidth !== this._colorTrackWidth) {
            this._colorTrackWidth = colorTrackWidth;
            this.redrawRequired = true;
        }
    }
    get colorTrackWidth(): number {
        return this._colorTrackWidth;
    }

    set containerSize(containerSize: ContainerSize) {
        if (isNullOrUndefined(this._containerSize)
            || containerSize.width !== this._containerSize.width
            || containerSize.height !== this._containerSize.height) {
            this._containerSize = deepCopy(containerSize);
            this.redrawRequired = true;
        }
    }
    get containerSize(): ContainerSize {
        return this._containerSize;
    }

    set orderedAccessions(orderedAccessions: string[]) {
        if (isNullOrUndefined(this._orderedAccessions)
            || !deepEqual(orderedAccessions, this._orderedAccessions)) {
            this._orderedAccessions = deepCopy(orderedAccessions);
            this.redrawRequired = true;
        }
    }
    get orderedAccessions(): string[] {
        if (isNullOrUndefined(this._orderedAccessions)
            && !isNullOrUndefined(this.tree)) {
            this._orderedAccessions = treeToOrderedList(this.tree.root);
        }
        return this._orderedAccessions;
    }

    set tree(tree: PheneticTree) {
        if (isNullOrUndefined(this._tree)
            || !deepEqual(tree.query, this._tree.query)) {
            this._tree = deepCopy(tree);
            this.redrawRequired = true;
        }
    }
    get tree(): PheneticTree {
        return this._tree;
    }

    set textSize(textSize: number) {
        if (isNullOrUndefined(this._textSize)
            || textSize !== this._textSize) {
            this._textSize = textSize;
            this.redrawRequired = true;
        }
    }
    get textSize(): number {
        return this._textSize;
    }

    getImageData(): ImageData {
        const ctx: CanvasRenderingContext2D = this.offscreenCanvas
                                                  .getContext('2d');
        return ctx.getImageData(0, 0, this.offscreenCanvas.width,
                                this.offscreenCanvas.height);
    }

    /**
     * Return the height of the canvas that overflows the container area.
     * This represents a pre-drawn area available for scrolling. When this is
     * negative, more of the canvas needs to be drawn.
     */
    private getOverflowHeight(containerOffsetY: number): number {
        return AccessionTreeView.STORED_CANVAS_HEIGHT
               - this.containerSize.height
               + containerOffsetY
               - this.canvasOffsetY;
    }

    /**
     * Check if the area that will be visible in the container currently drawn
     * in the canvas.
     */
    private isVisibleAreaDrawn(containerOffsetY: number,
                               containerSize: ContainerSize): boolean {
        const overflow = this.getOverflowHeight(containerOffsetY);
        if (overflow <= 0 || overflow > AccessionTreeView.STORED_CANVAS_HEIGHT
                             - containerSize.height) {
            // Plot was scrolled beyond the drawn area
            return false;
        }
        return true;
    }

    private updateOffset(containerOffsetY: number,
                         containerSize: ContainerSize) {
        const offsetStep = ceilTo(AccessionTreeView.STORED_CANVAS_OFFSET_STEP
                                  * AccessionTreeView.STORED_CANVAS_HEIGHT,
                                  this.textSize);
        let overflow = this.getOverflowHeight(containerOffsetY);
        while (overflow <= 0) {
            this.canvasOffsetY -= offsetStep;
            overflow = this.getOverflowHeight(containerOffsetY);
        }
        while (overflow > AccessionTreeView.STORED_CANVAS_HEIGHT
                          - containerSize.height) {
            this.canvasOffsetY += offsetStep;
            overflow = this.getOverflowHeight(containerOffsetY);
        }
    }
}

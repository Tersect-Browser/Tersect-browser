import * as deepEqual from 'fast-deep-equal';

import {
    PheneticTree
} from '../../models/PheneticTree';
import {
    AccessionDictionary,
    AccessionDisplayStyle
} from '../../tersect-browser/browser-settings';
import {
    ceilTo,
    deepCopy
} from '../../utils/utils';
import {
    ContainerSize
} from '../tersect-distance-plot.component';

export class AccessionTreeView {
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

    accessionStyle: AccessionDisplayStyle;
    accessionDictionary: AccessionDictionary;
    canvasOffsetY: number;
    colorTrackWidth: number;
    offscreenCanvas: HTMLCanvasElement;
    orderedAccessions: string[];
    redrawRequired: boolean;
    textSize: number;
    tree: PheneticTree;

    private containerSize: ContainerSize;

    constructor(accDict: AccessionDictionary,
                accStyle: AccessionDisplayStyle,
                tree: PheneticTree,
                containerOffsetY: number,
                containerSize: ContainerSize,
                textSize: number) {
        this.accessionDictionary = deepCopy(accDict);
        this.accessionStyle = accStyle;
        this.tree = deepCopy(tree);

        this.canvasOffsetY = containerOffsetY;
        this.containerSize = deepCopy(containerSize);
        this.textSize = textSize;
        this.colorTrackWidth = textSize;

        this.offscreenCanvas = document.createElement('canvas');
        this.offscreenCanvas.height = AccessionTreeView.STORED_CANVAS_HEIGHT;

        this.redrawRequired = true;
    }

    update(accDict: AccessionDictionary,
           accStyle: AccessionDisplayStyle,
           tree: PheneticTree,
           containerOffsetY: number,
           containerSize: ContainerSize,
           textSize: number) {
        if (!this.isVisibleAreaDrawn(containerOffsetY, containerSize)
            || this.settingsChanged(accDict, accStyle, tree,
                                    containerSize, textSize)) {
            this.updateOffset(containerOffsetY, containerSize);

            this.accessionDictionary = deepCopy(accDict);
            this.accessionStyle = accStyle;
            this.tree = deepCopy(tree);
            this.containerSize = deepCopy(containerSize);
            this.textSize = textSize;

            this.redrawRequired = true;
        }
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

    /**
     * Check whether the stored canvas settings match the provided settings.
     */
    private settingsChanged(accDict: AccessionDictionary,
                            accStyle: AccessionDisplayStyle,
                            tree: PheneticTree,
                            containerSize: ContainerSize,
                            textSize: number): boolean {
        return textSize !== this.textSize
               || containerSize.width !== this.containerSize.width
               || containerSize.height !== this.containerSize.height
               || accStyle !== this.accessionStyle
               || !deepEqual(tree.query, this.tree.query)
               || !deepEqual(accDict, this.accessionDictionary);
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

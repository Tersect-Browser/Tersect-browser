import * as deepEqual from 'fast-deep-equal';

import {
    AccessionDictionary,
    AccessionDisplayStyle
} from '../../introgression-browser/browser-settings';
import {
    TreeQuery
} from '../../models/TreeQuery';
import {
    ceilTo,
    deepCopy,
    isNullOrUndefined
} from '../../utils/utils';
import {
    ContainerSize
} from '../tersect-distance-plot.component';

export interface TreeViewSettings {
    accessionDictionary: AccessionDictionary;
    accessionStyle: AccessionDisplayStyle;
    treeQuery: TreeQuery;
}

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

    canvasOffsetY: number;
    redrawRequired: boolean;
    viewCanvas: HTMLCanvasElement;

    private readonly scrollStepY: number;

    private accessionDictionary: AccessionDictionary;
    private accessionStyle: AccessionDisplayStyle;
    private containerSize: ContainerSize;
    private treeQuery: TreeQuery;
    private zoomLevel: number;

    constructor(accDict: AccessionDictionary,
                accStyle: AccessionDisplayStyle,
                treeQuery: TreeQuery,
                containerOffsetY: number,
                containerSize: ContainerSize,
                zoomLevel: number,
                scrollStepY?: number) {
        this.accessionDictionary = deepCopy(accDict);
        this.accessionStyle = accStyle;
        this.treeQuery = deepCopy(treeQuery);

        this.canvasOffsetY = containerOffsetY;
        this.containerSize = deepCopy(containerSize);
        this.zoomLevel = zoomLevel;
        this.scrollStepY = !isNullOrUndefined(scrollStepY) ? scrollStepY : 1;

        this.viewCanvas = document.createElement('canvas');
        this.viewCanvas.height = AccessionTreeView.STORED_CANVAS_HEIGHT;

        this.redrawRequired = true;
    }

    update(accDict: AccessionDictionary,
           accStyle: AccessionDisplayStyle,
           treeQuery: TreeQuery,
           containerOffsetY: number,
           containerSize: ContainerSize,
           zoomLevel: number) {
        if (!this.isVisibleAreaDrawn(containerOffsetY, containerSize)
            || this.settingsChanged(accDict, accStyle, treeQuery,
                                    containerSize, zoomLevel)) {
            this.updateOffset(containerOffsetY, containerSize);

            this.accessionDictionary = deepCopy(accDict);
            this.accessionStyle = accStyle;
            this.treeQuery = deepCopy(treeQuery);
            this.containerSize = deepCopy(containerSize);
            this.zoomLevel = zoomLevel;

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
                            treeQuery: TreeQuery,
                            containerSize: ContainerSize,
                            zoomLevel: number): boolean {
        return zoomLevel !== this.zoomLevel
               || containerSize.width !== this.containerSize.width
               || containerSize.height !== this.containerSize.height
               || accStyle !== this.accessionStyle
               || !deepEqual(treeQuery, this.treeQuery)
               || !deepEqual(accDict, this.accessionDictionary);
    }

    private updateOffset(containerOffsetY: number,
                         containerSize: ContainerSize) {
        const offsetStep = ceilTo(AccessionTreeView.STORED_CANVAS_OFFSET_STEP
                                  * AccessionTreeView.STORED_CANVAS_HEIGHT,
                                  this.scrollStepY);
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

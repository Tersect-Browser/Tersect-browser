import * as deepEqual from 'fast-deep-equal';

import {
    ContainerSize
} from '../components/tersect-distance-plot/tersect-distance-plot.component';
import {
    deepCopy,
    isNullOrUndefined
} from '../utils/utils';
import {
    DistanceBins
} from './DistanceBins';
import {
    PlotPosition
} from './Plot';
import {
    SequenceInterval
} from './SequenceInterval';

export class DistanceBinView {
    static readonly DEFAULT_ASPECT_RATIO = 1 / 2;

    imageArray: Uint8ClampedArray;
    redrawRequired: boolean;

    aspectRatio = DistanceBinView.DEFAULT_ASPECT_RATIO;
    binHeight: number;
    containerSize: ContainerSize;
    orderedAccessions: string[];
    plotPosition: PlotPosition = { x: 0, y: 0 };
    sequenceGaps: SequenceInterval[];

    private _distanceBins: DistanceBins;

    constructor(distanceBins: DistanceBins,
                orderedAccessions: string[],
                binHeight: number) {
        this.distanceBins = distanceBins;
        this.orderedAccessions = orderedAccessions;
        this.binHeight = binHeight;
        this.redrawRequired = true;
    }

    get binsize(): number {
        return this.distanceBins.query.binsize;
    }

    get binWidth(): number {
        return this.binHeight * this.aspectRatio;
    }

    get colNum(): number {
        // The number of bins is the same for all accessions
        const acc = this.orderedAccessions[0];
        return this.distanceBins.bins[acc].length;
    }

    set distanceBins(distanceBins: DistanceBins) {
        if (isNullOrUndefined(this._distanceBins)
            || !deepEqual(distanceBins.query, this._distanceBins.query)) {
            this._distanceBins = deepCopy(distanceBins);
            this.redrawRequired = true;
        }
    }
    get distanceBins(): DistanceBins {
        return this._distanceBins;
    }

    get rowNum(): number {
        return this.orderedAccessions.length;
    }

    get interval(): number[] {
        return this.distanceBins.query.interval;
    }
}

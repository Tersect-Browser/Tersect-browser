import {
    ContainerSize
} from '../components/tersect-distance-plot/tersect-distance-plot.component';
import {
    PlotPosition
} from './Plot';

export class ScaleView {
    binsize: number;
    binWidth: number;
    containerSize: ContainerSize;
    interval: number[];
    plotPosition: PlotPosition = { x: 0, y: 0 };
    scaleBarHeight: number;

    constructor(interval: number[], binsize: number, binWidth: number,
                scaleBarHeight: number, containerSize?: ContainerSize) {
        this.interval = interval;
        this.binsize = binsize;
        this.binWidth = binWidth;
        this.scaleBarHeight = scaleBarHeight;
        this.containerSize = containerSize;
    }

    get bpPerPixel(): number {
        return this.binsize / this.binWidth;
    }

    /**
     * Convert position in terms of base pairs to position in terms of canvas
     * pixels.
     */
    bpToPixelPosition(bpPosition: number): number {
        return (bpPosition - this.interval[0]) / this.bpPerPixel;
    }
}

import { PlotPosition } from '../../shared/models/Plot';
import { ContainerSize } from '../components/tersect-distance-plot.component';

export class ScaleView {
    binsize: number;
    binWidth: number;
    containerSize: ContainerSize;
    interval: number[];
    plotPosition: PlotPosition = { x: 0, y: 0 };

    constructor(interval: number[], binsize: number, binWidth: number,
                containerSize: ContainerSize) {
        this.interval = interval;
        this.binsize = binsize;
        this.binWidth = binWidth;
        this.containerSize = containerSize;
    }

    get bpPerPixel(): number {
        return this.binsize / this.binWidth;
    }
}

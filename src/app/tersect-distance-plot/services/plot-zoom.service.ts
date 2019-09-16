import { Injectable } from '@angular/core';

import { ceilTo, floorTo } from '../../utils/utils';
import { PlotStateService } from './plot-state.service';

@Injectable()
export class PlotZoomService {
    static readonly MAX_ZOOM_LEVEL = 1000;
    static readonly MIN_ZOOM_LEVEL = 100;
    static readonly ZOOM_FACTOR = 1.3;
    static readonly ZOOM_ROUND_TO = 50;

    constructor(private readonly plotState: PlotStateService) { }

    isZoomMax(): boolean {
        return this.plotState.zoomLevel === PlotZoomService.MAX_ZOOM_LEVEL;
    }

    isZoomMin(): boolean {
        return this.plotState.zoomLevel === PlotZoomService.MIN_ZOOM_LEVEL;
    }

    zoomIn() {
        let zoomLevel = this.plotState.zoomLevel;
        zoomLevel *= PlotZoomService.ZOOM_FACTOR;
        zoomLevel = ceilTo(zoomLevel, PlotZoomService.ZOOM_ROUND_TO);
        if (zoomLevel > PlotZoomService.MAX_ZOOM_LEVEL) {
            zoomLevel = PlotZoomService.MAX_ZOOM_LEVEL;
        }
        this.plotState.zoomLevel = zoomLevel;
    }

    zoomOut() {
        let zoomLevel = this.plotState.zoomLevel;
        zoomLevel /= PlotZoomService.ZOOM_FACTOR;
        zoomLevel = floorTo(zoomLevel, PlotZoomService.ZOOM_ROUND_TO);
        if (zoomLevel < PlotZoomService.MIN_ZOOM_LEVEL) {
            zoomLevel = PlotZoomService.MIN_ZOOM_LEVEL;
        }
        this.plotState.zoomLevel = zoomLevel;
    }
}

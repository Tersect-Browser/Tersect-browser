import { Injectable } from '@angular/core';
import { PlotPosition } from '../models/PlotPosition';

interface GUIMargins {
    top: number;
    right: number;
    bottom: number;
    left: number;
}

@Injectable()
export class IntrogressionPlotService {
    /**
     * Default top bar size.
     */
    readonly GUI_SCALE_BAR_SIZE = 24;

    gui_margins: GUIMargins = {
        top: this.GUI_SCALE_BAR_SIZE,
        right: 0,
        bottom: 0,
        left: 0
    };

    binsize: number;

    /**
     * Zoom level in percentages.
     */
    zoom_level = 100;

    /**
     * Horizontal / vertical scroll position of the plot.
     */
    plot_position: PlotPosition = { x: 0, y: 0 };

    /**
     * Chromosomal interval displayed by the plot.
     */
    interval: number[];

    get zoom_factor(): number {
        return this.zoom_level / 100;
    }

    /**
     * Width of accession label / tree area in pixels.
     */
    get labels_width() {
        return this.gui_margins.left * this.zoom_factor;
    }
}

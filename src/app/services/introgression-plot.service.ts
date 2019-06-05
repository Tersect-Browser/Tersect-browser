import { Injectable } from '@angular/core';
import { PlotPosition } from '../models/PlotPosition';
import { TreeNode } from '../clustering/clustering';
import { BehaviorSubject } from 'rxjs/BehaviorSubject';

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

    /**
     * Bin aspect ratio (width / height). By default bins are twice as high as
     * they are wide. This is to more easily fit accession labels without making
     * the plot too wide.
     */
    aspect_ratio = 1 / 2;

    draw_tree = false;

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
    plot_position_source = new BehaviorSubject<PlotPosition>(
        { x: 0, y: 0 }
    );

    get plot_position() {
        return this.plot_position_source.getValue();
    }

    /**
     * Chromosomal interval displayed by the plot.
     */
    interval: number[];

    /**
     * Accession names (as used by tersect) sorted in the order to
     * be displayed on the drawn plot. Generally this is the order based on
     * the neighbor joining tree clustering.
     */
    sortedAccessions: string[] = [];

    /**
     * Neighbor joining tree built for the selected accessions.
     */
    njTree: TreeNode;

    /**
     * Genetic distance bins between reference and other accessions for
     * currently viewed interval, fetched from tersect.
     */
    distanceBins = {};

    get row_num(): number {
        return this.sortedAccessions.length;
    }

    get col_num(): number {
        return this.distanceBins[this.sortedAccessions[0]].length;
    }

    get zoom_factor(): number {
        return this.zoom_level / 100;
    }

    /**
     * Width of accession label / tree area in pixels.
     */
    get labels_width() {
        return this.gui_margins.left * this.zoom_factor;
    }

    get bin_width() {
        return this.zoom_factor;
    }

    get bin_height() {
        return this.zoom_factor / this.aspect_ratio;
    }

    updatePosition(pos: PlotPosition) {
        this.plot_position_source.next(pos);
    }

}

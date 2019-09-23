import { Component } from '@angular/core';

import {
    PlotStateService
} from '../../../tersect-distance-plot/services/plot-state.service';
import {
    AccessionDisplayStyle
} from '../../browser-settings';

@Component({
    selector: 'app-accession-style-selector',
    templateUrl: './accession-style-selector.component.html',
    styleUrls: [
        './accession-style-selector.component.css',
        '../tersect-browser.widgets.css'
    ]
})
export class AccessionStyleSelectorComponent {
    constructor(private readonly plotState: PlotStateService) { }

    set accessionStyle(accessionStyle: AccessionDisplayStyle) {
        this.plotState.accessionStyle = accessionStyle;
    }
    get accessionStyle() {
        return this.plotState.accessionStyle;
    }
}

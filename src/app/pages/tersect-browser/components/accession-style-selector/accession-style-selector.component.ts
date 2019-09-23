import { Component } from '@angular/core';

import {
    AccessionDisplayStyle
} from '../../../../components/tersect-distance-plot/models/PlotState';
import {
    PlotStateService
} from '../../../../components/tersect-distance-plot/services/plot-state.service';

@Component({
    selector: 'app-accession-style-selector',
    templateUrl: './accession-style-selector.component.html',
    styleUrls: [
        './accession-style-selector.component.css',
        '../../tersect-browser.widgets.css'
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

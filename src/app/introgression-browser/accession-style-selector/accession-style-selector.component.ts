import { Component } from '@angular/core';
import { AccessionDisplayStyle } from '../browser-settings';
import { PlotStateService } from '../../introgression-plot/services/plot-state.service';

@Component({
    selector: 'app-accession-style-selector',
    templateUrl: './accession-style-selector.component.html',
    styleUrls: [
        './accession-style-selector.component.css',
        '../introgression-browser.widgets.css'
    ]
})
export class AccessionStyleSelectorComponent {
    set accessionStyle(accessionStyle: AccessionDisplayStyle) {
        this.plotState.accessionStyle = accessionStyle;
    }
    get accessionStyle() {
        return this.plotState.accessionStyle;
    }

    constructor(private readonly plotState: PlotStateService) { }
}

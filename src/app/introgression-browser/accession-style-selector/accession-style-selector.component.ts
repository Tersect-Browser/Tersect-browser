import { Component, Input, Output, EventEmitter } from '@angular/core';
import { AccessionDisplayStyle } from '../browser-settings';

@Component({
    selector: 'app-accession-style-selector',
    templateUrl: './accession-style-selector.component.html',
    styleUrls: [
        './accession-style-selector.component.css',
        '../introgression-browser.widgets.css'
    ]
})
export class AccessionStyleSelectorComponent {
    _accessionStyle: AccessionDisplayStyle;

    @Input()
    set accessionStyle(accessionStyle: AccessionDisplayStyle) {
        this._accessionStyle = accessionStyle;
        this.accessionStyleChange.emit(accessionStyle);
    }

    get accessionStyle() {
        return this._accessionStyle;
    }

    @Output()
    accessionStyleChange = new EventEmitter<AccessionDisplayStyle>();
}

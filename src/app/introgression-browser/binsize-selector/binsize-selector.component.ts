import { Component, Input, Output, EventEmitter } from '@angular/core';
import { ceilTo, clamp } from '../../utils/utils';

@Component({
    selector: 'app-binsize-selector',
    templateUrl: './binsize-selector.component.html',
    styleUrls: ['./binsize-selector.component.css']
})
export class BinsizeSelectorComponent {
    private _binsize: number;
    @Input()
    set binsize(binsize: number) {
        this._binsize = this.roundAndClampBinsize(binsize);
    }
    get binsize(): number {
        return this._binsize;
    }

    @Output()
    binsizeChange = new EventEmitter<number>();

    binsize_min = 1000;
    binsize_step = 1000;
    binsize_max = 100000;
    widget_binsize: number;

    updateBinsize() {
        this.binsizeChange.emit(this.binsize);
    }

    /**
     * Rounds a bin size value to the step size used and restricts the value
     * according to minimum and maximum values.
     * This is done manually because setting the PrimeNG step binding discards
     * the original event which we need to distinguish slider clicks from drags.
     */
    private roundAndClampBinsize(binsize: number): number {
        return clamp(ceilTo(binsize, this.binsize_step),
                            this.binsize_min, this.binsize_max);
    }

    binsizeSliderChange($event: { event: Event, value: number }) {
        if ($event.event.type === 'click') {
            this.binsizeChange.emit(this.roundAndClampBinsize($event.value));
        }
    }
}

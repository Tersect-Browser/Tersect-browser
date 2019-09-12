import { Component } from '@angular/core';
import { ceilTo, clamp, isNullOrUndefined } from '../../utils/utils';
import { PlotStateService } from '../../introgression-plot/services/plot-state.service';

@Component({
    selector: 'app-binsize-selector',
    templateUrl: './binsize-selector.component.html',
    styleUrls: ['./binsize-selector.component.css']
})
export class BinsizeSelectorComponent {
    private _binsize: number;
    set binsize(binsize: number) {
        this._binsize = this.roundAndClampBinsize(binsize);
    }
    get binsize(): number {
        return this.plotState.binsize;
    }

    readonly BINSIZE_MIN = 1000;
    readonly BINSIZE_STEP = 1000;
    readonly BINSIZE_MAX = 100000;

    constructor(private readonly plotState: PlotStateService) { }

    updateBinsize(binsize?: number) {
        if (isNullOrUndefined(binsize)) {
            this.plotState.binsize = this._binsize;
        } else {
            this.plotState.binsize = this.roundAndClampBinsize(binsize);
        }
    }

    /**
     * Rounds a bin size value to the step size used and restricts the value
     * according to minimum and maximum values.
     * This is done manually because setting the PrimeNG step binding discards
     * the original event which we need to distinguish slider clicks from drags.
     */
    private roundAndClampBinsize(binsize: number): number {
        return clamp(ceilTo(binsize, this.BINSIZE_STEP),
                            this.BINSIZE_MIN, this.BINSIZE_MAX);
    }

    binsizeSliderChange($event: { event: Event, value: number }) {
        if ($event.event.type === 'click') {
            this.updateBinsize($event.value);
        }
    }
}

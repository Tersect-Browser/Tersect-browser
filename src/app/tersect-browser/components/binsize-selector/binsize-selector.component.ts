import { Component, OnDestroy, OnInit } from '@angular/core';

import {
    Subscription
} from 'rxjs';

import {
    PlotStateService
} from '../../../tersect-distance-plot/services/plot-state.service';
import {
    ceilTo,
    clamp,
    isNullOrUndefined
} from '../../../utils/utils';

@Component({
    selector: 'app-binsize-selector',
    templateUrl: './binsize-selector.component.html',
    styleUrls: ['./binsize-selector.component.css']
})
export class BinsizeSelectorComponent implements OnInit, OnDestroy {
    readonly BINSIZE_MAX = 100000;
    readonly BINSIZE_MIN = 1000;
    readonly BINSIZE_STEP = 1000;

    binsizeUpdate: Subscription;

    private _binsize: number;

    constructor(private readonly plotState: PlotStateService) { }

    set binsize(binsize: number) {
        this._binsize = this.roundAndClampBinsize(binsize);
    }
    get binsize(): number {
        return this._binsize;
    }

    ngOnInit() {
        this.binsizeUpdate = this.plotState.binsize$.subscribe(binsize => {
            // Update directly as the source might not be rounded or clamped
            this._binsize = binsize;
        });
    }

    ngOnDestroy() {
        this.binsizeUpdate.unsubscribe();
    }

    binsizeSliderChange($event: { event: Event, value: number }) {
        if ($event.event.type === 'click') {
            this.updateBinsize($event.value);
        }
    }

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
}

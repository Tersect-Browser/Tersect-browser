import { Component } from '@angular/core';

import {
    PlotStateService
} from '../../introgression-plot/services/plot-state.service';
import {
    Chromosome
} from '../../models/Chromosome';
import {
    isNullOrUndefined
} from '../../utils/utils';

@Component({
    selector: 'app-interval-selector',
    templateUrl: './interval-selector.component.html',
    styleUrls: ['./interval-selector.component.css']
})
export class IntervalSelectorComponent {
    readonly TYPING_DELAY = 750;
    private intervalInputTimeout: NodeJS.Timer;

    private _intervalStart = 0;
    set intervalStart(pos: number) {
        this._intervalStart = this.processInputPosition(pos);
    }
    get intervalStart(): number {
        if (!isNullOrUndefined(this.plotState.interval)) {
            return this.plotState.interval[0];
        } else {
            return undefined;
        }
    }

    private _intervalEnd = 0;
    set intervalEnd(pos: number) {
        this._intervalEnd = this.processInputPosition(pos);
    }
    get intervalEnd(): number {
        if (!isNullOrUndefined(this.plotState.interval)) {
            return this.plotState.interval[1];
        } else {
            return undefined;
        }
    }

    set interval(interval: number[]) {
        this.intervalStart = interval[0];
        this.intervalEnd = interval[1];
    }
    get interval(): number[] {
        return this.plotState.interval;
    }

    get chromosome(): Chromosome {
        return this.plotState.chromosome;
    }

    constructor(private readonly plotState: PlotStateService) { }

    private processInputPosition(pos: number): number {
        // used as a workaround due to possible PrimeNG bug
        // numbers typed into text box are sometimes interpreted as strings
        const fixedPos = parseInt(pos.toString(), 10);
        if (!isNaN(fixedPos)) {
            return fixedPos;
        } else {
            return 0;
        }
    }

    typeInterval() {
        clearTimeout(this.intervalInputTimeout);
        this.intervalInputTimeout = setTimeout(() => this.updateInterval(),
                                                 this.TYPING_DELAY);
    }

    updateInterval() {
        this.plotState.interval = [this._intervalStart, this._intervalEnd];
    }

    intervalSliderChange($event: { event: Event, values: number[] }) {
        // Selecting full chromosome on click
        if ($event.event.type === 'click') {
            this.intervalStart = 1;
            this.intervalEnd = this.chromosome.size;
            this.updateInterval();
        }
    }
}

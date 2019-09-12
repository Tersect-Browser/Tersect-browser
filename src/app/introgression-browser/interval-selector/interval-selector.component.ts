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
    static readonly TYPING_DELAY = 750;

    private _intervalEnd = 0;
    private _intervalStart = 0;

    private intervalInputTimeout: NodeJS.Timer;

    constructor(private readonly plotState: PlotStateService) { }

    get chromosome(): Chromosome {
        return this.plotState.chromosome;
    }

    set interval(interval: number[]) {
        this.intervalStart = interval[0];
        this.intervalEnd = interval[1];
    }
    get interval(): number[] {
        return this.plotState.interval;
    }

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

    intervalSliderChange($event: { event: Event, values: number[] }) {
        // Selecting full chromosome on click
        if ($event.event.type === 'click') {
            this.intervalStart = 1;
            this.intervalEnd = this.chromosome.size;
            this.updateInterval();
        }
    }

    typeInterval() {
        clearTimeout(this.intervalInputTimeout);
        this.intervalInputTimeout = setTimeout(
            () => this.updateInterval(), IntervalSelectorComponent.TYPING_DELAY
        );
    }

    updateInterval() {
        this.plotState.interval = [this._intervalStart, this._intervalEnd];
    }

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
}

import { Component, OnDestroy, OnInit } from '@angular/core';

import { Subscription } from 'rxjs';

import {
    PlotStateService
} from '../../../../components/tersect-distance-plot/services/plot-state.service';
import {
    clamp,
    isNullOrUndefined
} from '../../../../utils/utils';

@Component({
    selector: 'app-interval-selector',
    templateUrl: './interval-selector.component.html',
    styleUrls: ['./interval-selector.component.css']
})
export class IntervalSelectorComponent implements OnInit, OnDestroy {
    static readonly TYPING_DELAY = 750;

    interval = [1, Infinity];

    private intervalInputTimeout: NodeJS.Timer;
    private intervalUpdate: Subscription;

    constructor(private readonly plotState: PlotStateService) { }

    get chromosomeSize(): number {
        if (!isNullOrUndefined(this.plotState.chromosome)) {
            return this.plotState.chromosome.size;
        } else {
            return 1;
        }
    }

    set intervalEnd(pos: number) {
        const endPos = this.processInputPosition(pos);
        this.interval = [
            this.interval[0],
            clamp(endPos, this.interval[0], this.chromosomeSize)
        ];
    }
    get intervalEnd(): number {
        return this.interval[1];
    }

    set intervalStart(pos: number) {
        const startPos = this.processInputPosition(pos);
        this.interval = [
            clamp(startPos, 1, this.interval[1]),
            this.interval[1]
        ];
    }
    get intervalStart(): number {
        return this.interval[0];
    }

    ngOnInit() {
        this.intervalUpdate = this.plotState.interval$.subscribe(interval => {
            if (!isNullOrUndefined(interval)) {
                this.intervalStart = interval[0];
                this.intervalEnd = interval[1];
            }
        });
    }

    ngOnDestroy() {
        this.intervalUpdate.unsubscribe();
    }

    intervalSliderChange($event: { event: Event, values: number[] }) {
        // Selecting full chromosome on click
        if ($event.event.type === 'click') {
            this.intervalStart = 1;
            this.intervalEnd = this.chromosomeSize;
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
        this.plotState.interval = [...this.interval];
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

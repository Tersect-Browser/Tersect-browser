import { Component, EventEmitter, Output, Input } from '@angular/core';
import { Chromosome } from '../../models/Chromosome';
import { isNullOrUndefined } from 'util';

@Component({
    selector: 'app-interval-selector',
    templateUrl: './interval-selector.component.html',
    styleUrls: ['./interval-selector.component.css']
})
export class IntervalSelectorComponent {
    readonly TYPING_DELAY = 750;
    private interval_input_timeout: NodeJS.Timer;

    @Input()
    chromosome: Chromosome;

    @Input()
    interval: number[] = [0, 0];

    @Output()
    intervalChange = new EventEmitter<number[]>();

    set intervalStart(pos: number) {
        this.interval[0] = this.processInputPosition(pos);
    }
    get intervalStart(): number {
        if (!isNullOrUndefined(this.interval)) {
            return this.interval[0];
        } else {
            return undefined;
        }
    }

    set intervalEnd(pos: number) {
        this.interval[1] = this.processInputPosition(pos);
    }
    get intervalEnd(): number {
        if (!isNullOrUndefined(this.interval)) {
            return this.interval[1];
        } else {
            return undefined;
        }
    }

    private processInputPosition(pos: number): number {
        // used as a workaround due to possible PrimeNG bug
        // numbers typed into text box are sometimes interpreted as strings
        const fixed_pos = parseInt(pos.toString(), 10);
        if (!isNaN(fixed_pos)) {
            return fixed_pos;
        } else {
            return 0;
        }
    }

    typeInterval() {
        clearTimeout(this.interval_input_timeout);
        this.interval_input_timeout = setTimeout(() => this.updateInterval(),
                                                 this.TYPING_DELAY);
    }

    updateInterval() {
        this.intervalChange.emit([this.intervalStart, this.intervalEnd]);
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

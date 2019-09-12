
import { Component, ElementRef, ViewChild } from '@angular/core';

import {
    PlotAccession,
    PlotBin,
    PlotMouseHoverEvent,
    PlotPosition,
    PlotSequenceInterval,
    PlotSequencePosition
} from '../models/PlotPosition';
import {
    formatPosition
} from '../utils/utils';

@Component({
    selector: 'app-tooltip',
    templateUrl: './tooltip.component.html',
    styleUrls: ['./tooltip.component.css']
})
export class TooltipComponent {
    @ViewChild('tooltip', { static: true })
    readonly tooltip: ElementRef;

    /**
     * Tooltip position relative to mouse.
     */
    readonly tooltipOffset: PlotPosition = { x: 0, y: 20 };

    hide() {
        this.tooltip.nativeElement.style.visibility = 'hidden';
    }

    show($event: PlotMouseHoverEvent) {
        this.tooltip.nativeElement.style.left = `${$event.x
                                                   + this.tooltipOffset.x}px`;
        this.tooltip.nativeElement.style.top = `${$event.y
                                                  + this.tooltipOffset.y}px`;
        this.tooltip.nativeElement.style.visibility = 'visible';
        this.tooltip.nativeElement.innerHTML = this.formatContent($event);
    }

    private formatBinTooltip(target: PlotBin): string {
        return `${target.accession_label}<br>
${formatPosition(target.start_position)}
 - ${formatPosition(target.end_position)}`;
    }

    private formatContent($event: PlotMouseHoverEvent): string {
        switch ($event.target.type) {
            case 'bin':
                return this.formatBinTooltip($event.target as PlotBin);
            case 'accession':
                return `${($event.target as PlotAccession).accession_label}`;
            case 'position':
                return this.formatPositionTooltip($event.target as
                                                  PlotSequencePosition);
            case 'interval':
                return this.formatIntervalTooltip($event.target as
                                                  PlotSequenceInterval);
            default:
                return '';
        }
    }

    private formatIntervalTooltip(target: PlotSequenceInterval): string {
        return `${formatPosition(target.start_position)}
- ${formatPosition(target.end_position)}`;
    }

    private formatPositionTooltip(target: PlotSequencePosition): string {
        return `${formatPosition(target.position)}`;
    }
}

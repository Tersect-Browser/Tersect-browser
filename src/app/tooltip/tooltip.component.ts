
import { Component, ElementRef, ViewChild } from '@angular/core';

import {
    PlotAccession,
    PlotBin,
    PlotMouseHoverEvent,
    PlotSequenceInterval,
    PlotSequencePosition,
    Position
} from '../models/Plot';
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
    readonly tooltipOffset: Position = { x: 0, y: 20 };

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

    private formatAccessionTooltip(target: PlotAccession): string {
        return `${target.accessionLabel}`;
    }

    private formatBinTooltip(target: PlotBin): string {
        const interval = this.formatIntervalTooltip(target);
        return `${target.accessionLabel}<br>${interval}`;
    }

    private formatContent($event: PlotMouseHoverEvent): string {
        switch ($event.target.plotAreaType) {
            case 'bin':
                return this.formatBinTooltip($event.target as PlotBin);
            case 'accession':
                return this.formatAccessionTooltip($event.target as
                                                   PlotAccession);
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
        const startPos = formatPosition(target.startPosition);
        const endPos = formatPosition(target.endPosition);
        return `${startPos} - ${endPos}`;
    }

    private formatPositionTooltip(target: PlotSequencePosition): string {
        return `${formatPosition(target.position)}`;
    }
}

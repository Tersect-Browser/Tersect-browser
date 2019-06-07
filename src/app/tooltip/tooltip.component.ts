import { Component, ElementRef, ViewChild } from '@angular/core';
import { PlotPosition, PlotHoverEvent, PlotBin, PlotAccession, PlotChromosomePosition } from '../models/PlotPosition';
import { formatPosition } from '../utils/utils';

@Component({
    selector: 'app-tooltip',
    templateUrl: './tooltip.component.html',
    styleUrls: ['./tooltip.component.css']
})

export class TooltipComponent {
    @ViewChild('tooltip') tooltip: ElementRef;

    /**
     * Tooltip position relative to mouse.
     */
    readonly tooltip_offset: PlotPosition = { x: 0, y: 20 };

    private formatBinTooltip(target: PlotBin): string {
        return `${target.accession}<br>${formatPosition(target.start_position)}
- ${formatPosition(target.end_position)}`;
    }

    private formatPositionTooltip(target: PlotChromosomePosition): string {
        return `${formatPosition(target.position)}`;
    }

    private formatContent($event: PlotHoverEvent): string {
        if ($event.target.type === 'bin') {
            return this.formatBinTooltip($event.target as PlotBin);
        } else if ($event.target.type === 'accession') {
            return `${($event.target as PlotAccession).accession}`;
        } else if ($event.target.type === 'position') {
            return this.formatPositionTooltip($event.target as
                                              PlotChromosomePosition);
        }
        return '';
    }

    show($event: PlotHoverEvent) {
        this.tooltip.nativeElement.style.left = `${$event.x
                                                   + this.tooltip_offset.x}px`;
        this.tooltip.nativeElement.style.top = `${$event.y
                                                  + this.tooltip_offset.y}px`;
        this.tooltip.nativeElement.style.visibility = 'visible';
        this.tooltip.nativeElement.innerHTML = this.formatContent($event);
    }

    hide() {
        this.tooltip.nativeElement.style.visibility = 'hidden';
    }
}

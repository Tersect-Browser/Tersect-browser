import { Component, ElementRef, ViewChild } from '@angular/core';
import { PlotPosition, PlotHoverEvent, PlotBin, PlotAccession } from '../models/PlotPosition';
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

    show($event: PlotHoverEvent) {
        let content = '';
        if ($event.target.type === 'bin') {
            content = this.formatBinTooltip($event.target as PlotBin);
        } else if ($event.target.type === 'accession') {
            content = `${($event.target as PlotAccession).accession}`;
        }

        this.tooltip.nativeElement.style.left = `${$event.x
                                                   + this.tooltip_offset.x}px`;
        this.tooltip.nativeElement.style.top = `${$event.y
                                                  + this.tooltip_offset.y}px`;
        this.tooltip.nativeElement.style.visibility = 'visible';
        this.tooltip.nativeElement.innerHTML = content;
    }

    hide() {
        this.tooltip.nativeElement.style.visibility = 'hidden';
    }
}

import { PlotAccession, PlotBin, PlotMouseClickEvent, PlotSequencePosition, PlotSequenceInterval } from '../models/PlotPosition';
import { formatPosition } from '../utils/utils';

import { Component, ElementRef, Output, EventEmitter } from '@angular/core';
import { MenuItem } from 'primeng/components/common/menuitem';

@Component({
    selector: 'app-plot-click-menu',
    templateUrl: './plot-click-menu.component.html',
    styleUrls: ['./plot-click-menu.component.css']
})

export class PlotClickMenuComponent {
    constructor(private el: ElementRef) { }

    @Output() setReference = new EventEmitter<string>();
    @Output() removeAccession = new EventEmitter<string>();
    @Output() setInterval = new EventEmitter<number[]>();
    @Output() setIntervalStart = new EventEmitter<number>();
    @Output() setIntervalEnd = new EventEmitter<number>();

    menuItems: MenuItem[] = [];

    private set position(pos: { x: number, y: number }) {
        this.el.nativeElement.style.left = `${pos.x}px`;
        this.el.nativeElement.style.top = `${pos.y}px`;
    }

    private getAccessionItem(target_accession: PlotAccession): MenuItem {
        return {
            label: target_accession.accession_label,
            items: [
                {
                    label: 'Set as reference',
                    icon: 'fa fa-star-o',
                    command: () => {
                        this.setReference.emit(target_accession.accession);
                        this.hide();
                    }
                },
                {
                    label: 'Remove from plot',
                    icon: 'fa fa-remove',
                    command: () => {
                        this.removeAccession.emit(target_accession.accession);
                        this.hide();
                    }
                }
            ]
        };
    }

    private getBinItem(bin: PlotBin): MenuItem {
        return {
            label: `${formatPosition(bin.start_position)}
- ${formatPosition(bin.end_position)}`,
            items: [
                {
                    label: 'Set as interval start',
                    icon: 'fa fa-chevron-left',
                    command: () => {
                        this.setIntervalStart.emit(bin.start_position);
                        this.hide();
                    }
                },
                {
                    label: 'Set as interval end',
                    icon: 'fa fa-chevron-right',
                    command: () => {
                        this.setIntervalEnd.emit(bin.end_position);
                        this.hide();
                    }
                }
            ]
        };
    }

    private getPositionItem(pos: PlotSequencePosition): MenuItem {
        return {
            label: `${formatPosition(pos.position)}`,
            items: [
                {
                    label: 'Set as interval start',
                    icon: 'fa fa-chevron-left',
                    command: () => {
                        this.setIntervalStart.emit(pos.position);
                        this.hide();
                    }
                },
                {
                    label: 'Set as interval end',
                    icon: 'fa fa-chevron-right',
                    command: () => {
                        this.setIntervalEnd.emit(pos.position);
                        this.hide();
                    }
                }
            ]
        };
    }

    private getIntervalItem(int: PlotSequenceInterval): MenuItem {
        return {
            label: `${formatPosition(int.start_position)}
- ${formatPosition(int.end_position)}`,
            items: [
                {
                    label: 'Set as interval',
                    icon: 'fa fa-arrows-h',
                    command: () => {
                        this.setInterval.emit([int.start_position,
                                               int.end_position]);
                        this.hide();
                    }
                }
            ]
        };
    }

    show($event: PlotMouseClickEvent) {
        if ($event.target.type === 'accession') {
            this.menuItems = [
                this.getAccessionItem($event.target as PlotAccession)
            ];
        } else if ($event.target.type === 'bin') {
            this.menuItems = [
                this.getAccessionItem($event.target as PlotAccession),
                this.getBinItem($event.target as PlotBin)
            ];
        } else if ($event.target.type === 'position') {
            this.menuItems = [
                this.getPositionItem($event.target as PlotSequencePosition)
            ];
        } else if ($event.target.type === 'interval') {
            this.menuItems = [
                this.getIntervalItem($event.target as PlotSequenceInterval)
            ];
        } else {
            // Menu not visible for other types
            return;
        }

        this.position = { x: $event.x, y: $event.y };
        this.el.nativeElement.style.visibility = 'visible';
    }

    hide() {
        this.position = { x: 0, y: 0 };
        this.el.nativeElement.style.visibility = 'hidden';
    }

}

import { Component, ViewChild, ElementRef, OnInit, Output, EventEmitter } from '@angular/core';
import { MenuItem } from 'primeng/components/common/menuitem';
import { PlotAccession, PlotBin, PlotMouseClickEvent, PlotSequencePosition } from '../models/PlotPosition';
import { formatPosition } from '../utils/utils';

@Component({
    selector: 'app-plot-click-menu',
    templateUrl: './plot-click-menu.component.html',
    styleUrls: ['./plot-click-menu.component.css']
})

export class PlotClickMenuComponent implements OnInit {
    @ViewChild('menuContainer') menuContainer: ElementRef;

    @Output() setReference = new EventEmitter<string>();
    @Output() removeAccession = new EventEmitter<string>();
    @Output() setIntervalStart = new EventEmitter<number>();
    @Output() setIntervalEnd = new EventEmitter<number>();

    menuItems: MenuItem[] = [];

    private _position = { x: 0, y: 0 };
    private set position(pos: { x: number, y: number }) {
        this._position = pos;
        this.menuContainer.nativeElement.style.left = `${this._position.x}px`;
        this.menuContainer.nativeElement.style.top = `${this._position.y}px`;
    }

    private observer = new MutationObserver(() => { this.adjustPosition(); });

    ngOnInit() {
        this.observer.observe(this.menuContainer.nativeElement,
                              { attributes: true });
    }

    /**
     * Adjusts menu position so that is does not overflow.
     */
    private adjustPosition() {
        const menu_width = this.menuContainer.nativeElement.offsetWidth;
        const menu_height = this.menuContainer.nativeElement.offsetHeight;

        if (menu_width > window.innerWidth
            || menu_height > window.innerHeight) {
            // No way to fit the menu inside the plot area
            return;
        }

        const x_overflow = this._position.x + menu_width - window.innerWidth;
        const y_overflow = this._position.y + menu_height - window.innerHeight;

        if (x_overflow > 0 || y_overflow > 0) {
            this.position = {
                x: x_overflow > 0 ? this._position.x - x_overflow
                                  : this._position.x,
                y: y_overflow > 0 ? this._position.y - menu_height
                                  : this._position.y
            };
        }
    }

    private getAccessionItem(accession: PlotAccession): MenuItem {
        return {
            label: accession.accession,
            items: [
                {
                    label: 'Set as reference',
                    icon: 'fa fa-star-o',
                    command: () => {
                        this.setReference.emit(accession.accession);
                        this.hide();
                    }
                },
                {
                    label: 'Remove from plot',
                    icon: 'fa fa-remove',
                    command: () => {
                        this.removeAccession.emit(accession.accession);
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
        } else {
            // Menu not visible for other types
            return;
        }

        this.position = { x: $event.x, y: $event.y };
        this.menuContainer.nativeElement.style.visibility = 'visible';
    }

    hide() {
        this.position = { x: 0, y: 0 };
        this.menuContainer.nativeElement.style.visibility = 'hidden';
    }

    clickMask($event) {
        this.hide();
    }
}

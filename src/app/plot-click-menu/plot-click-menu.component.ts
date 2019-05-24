import { Component, ViewChild, ElementRef } from '@angular/core';
import { MenuItem } from 'primeng/components/common/menuitem';
import { PlotClickEvent, PlotAccession, PlotBin } from '../models/PlotPosition';
import { formatPosition } from '../utils/utils';

@Component({
    selector: 'app-plot-click-menu',
    templateUrl: './plot-click-menu.component.html',
    styleUrls: ['./plot-click-menu.component.css']
})

export class PlotClickMenuComponent {
    menuItems: MenuItem[] = [];

    @ViewChild('clickMenu') clickMenu: ElementRef;

    private getAccessionItem(accession: PlotAccession): MenuItem {
        return {
            label: accession.accession,
            items: [
                { label: 'Set as reference', icon: 'fa fa-star-o' },
                { label: 'Remove from plot', icon: 'fa fa-remove' }
            ]
        };
    }

    private getBinItem(bin: PlotBin): MenuItem {
        return {
            label: `${formatPosition(bin.start_position)}
- ${formatPosition(bin.end_position)}`,
            items: [
                { label: 'Set as interval start', icon: 'fa fa-chevron-left'},
                { label: 'Set as interval end', icon: 'fa fa-chevron-right'}
            ]
        };
    }

    show($event: PlotClickEvent) {
        if ($event.target.type === 'accession') {
            this.menuItems = [
                this.getAccessionItem($event.target as PlotAccession)
            ];
        } else if ($event.target.type === 'bin') {
            this.menuItems = [
                this.getAccessionItem($event.target as PlotAccession),
                this.getBinItem($event.target as PlotBin)
            ];
        } else {
            // Menu not visible for types other than 'bin' or 'accession'
            return;
        }
        this.clickMenu.nativeElement.style.left = `${$event.x}px`;
        this.clickMenu.nativeElement.style.top = `${$event.y}px`;
        this.clickMenu.nativeElement.style.visibility = 'visible';
    }

    hide() {
        this.clickMenu.nativeElement.style.left = '0px';
        this.clickMenu.nativeElement.style.left = '0px';
        this.clickMenu.nativeElement.style.visibility = 'hidden';
    }

    clickMask($event) {
        this.hide();
    }
}

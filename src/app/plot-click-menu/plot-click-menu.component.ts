import { Component, ViewChild, ElementRef } from '@angular/core';
import { MenuItem } from 'primeng/components/common/menuitem';

@Component({
    selector: 'app-plot-click-menu',
    templateUrl: './plot-click-menu.component.html',
    styleUrls: ['./plot-click-menu.component.css']
})

export class PlotClickMenuComponent {
    items: MenuItem[] = [
        {
            label: 'Accession',
            items: [
                { label: 'Set as reference', icon: 'fa fa-star-o' },
                { label: 'Remove from plot', icon: 'fa fa-remove' }
            ]
        },
        {
            label: 'Bin',
            items: [
                { label: 'Set as interval start', icon: 'fa fa-chevron-left'},
                { label: 'Set as interval end', icon: 'fa fa-chevron-right'}
            ]
        }
    ];

    @ViewChild('clickMenu') clickMenu: ElementRef;

    show(x_pos: number, y_pos: number) {
        this.clickMenu.nativeElement.style.left = `${x_pos}px`;
        this.clickMenu.nativeElement.style.top = `${y_pos}px`;
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

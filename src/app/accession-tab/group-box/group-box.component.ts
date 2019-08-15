import { Component, ViewEncapsulation, Input } from '@angular/core';
import { AccessionGroup } from '../accession-tab.component';

@Component({
    selector: 'app-group-box',
    templateUrl: './group-box.component.html',
    styleUrls: ['./group-box.component.css'],
    encapsulation: ViewEncapsulation.None
})
export class GroupBoxComponent {
    @Input()
    groups: AccessionGroup[];

    _selected_groups: AccessionGroup[];
    set selected_groups(groups: AccessionGroup[]) {
        console.log(groups);
        this._selected_groups = groups;
    }
    get selected_groups(): AccessionGroup[] {
        return this._selected_groups;
    }
}

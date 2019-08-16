import { AccessionGroup } from '../accession-tab.component';

import { Component, ViewEncapsulation, Input, Output, EventEmitter } from '@angular/core';

@Component({
    selector: 'app-group-box',
    templateUrl: './group-box.component.html',
    styleUrls: ['./group-box.component.css'],
    encapsulation: ViewEncapsulation.None
})
export class GroupBoxComponent {
    @Input()
    groups: AccessionGroup[];

    @Input()
    categories: string[] = [];

    _selectedGroups: AccessionGroup[];
    @Input()
    set selectedGroups(groups: AccessionGroup[]) {
        this._selectedGroups = groups;
        this.selectedGroupsChange.emit(this._selectedGroups);
    }
    get selectedGroups(): AccessionGroup[] {
        return this._selectedGroups;
    }
    @Output() selectedGroupsChange = new EventEmitter<AccessionGroup[]>();

    extractCategoryGroups(category: string): AccessionGroup[] {
        return this.groups.filter(grp => grp.category === category);
    }
}

import { AccessionGroup } from '../accession-tab.component';

import { Component, ViewEncapsulation, Input, Output, EventEmitter } from '@angular/core';

@Component({
    selector: 'app-group-box',
    templateUrl: './group-box.component.html',
    styleUrls: ['./group-box.component.css'],
    encapsulation: ViewEncapsulation.None
})
export class GroupBoxComponent {
    _groups: AccessionGroup[];
    @Input()
    set groups(groups: AccessionGroup[]) {
        this._groups = groups;
        this.groupsChange.emit(this._groups);
    }
    @Output() groupsChange = new EventEmitter<AccessionGroup[]>();
    get groups(): AccessionGroup[] {
        return this._groups;
    }

    _selectedGroups: AccessionGroup[];
    @Input()
    set selectedGroups(groups: AccessionGroup[]) {
        this._selectedGroups = groups;
        this.selectedGroupsChange.emit(this._selectedGroups);
    }
    @Output() selectedGroupsChange = new EventEmitter<AccessionGroup[]>();
    get selectedGroups(): AccessionGroup[] {
        return this._selectedGroups;
    }

    @Input()
    categories: string[] = [];

    extractCategoryGroups(category: string): AccessionGroup[] {
        return this.groups.filter(grp => grp.category === category);
    }

    removeGroup(group: AccessionGroup) {
        this.groups.splice(this.groups.indexOf(group), 1);
        this.groups = [...this.groups];
    }
}

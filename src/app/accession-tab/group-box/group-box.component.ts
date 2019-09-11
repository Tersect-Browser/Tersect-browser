import { AccessionGroup } from '../../introgression-browser/browser-settings';
import { RemoveGroupDialogComponent } from '../remove-group-dialog/remove-group-dialog.component';

import { Component, ViewEncapsulation, Input, Output, EventEmitter, ViewChild } from '@angular/core';
import { ColorSelectorComponent, ColorChangeEvent } from '../../color-selector/color-selector.component';
import { isNullOrUndefined } from '../../utils/utils';

@Component({
    selector: 'app-group-box',
    templateUrl: './group-box.component.html',
    styleUrls: ['./group-box.component.css'],
    encapsulation: ViewEncapsulation.None
})
export class GroupBoxComponent {
    @ViewChild(RemoveGroupDialogComponent, { static: true })
    removeGroupDialog: RemoveGroupDialogComponent;

    @ViewChild(ColorSelectorComponent, { static: true })
    colorSelector: ColorSelectorComponent;

    private _groups: AccessionGroup[];
    @Input()
    set groups(groups: AccessionGroup[]) {
        this._groups = groups;
        this.groupsChange.emit(this._groups);
    }
    @Output() groupsChange = new EventEmitter<AccessionGroup[]>();
    get groups(): AccessionGroup[] {
        return this._groups;
    }

    private _selectedGroups: AccessionGroup[];
    @Input()
    set selectedGroups(groups: AccessionGroup[]) {
        this._selectedGroups = groups;
        this.selectedGroupsChange.emit(this._selectedGroups);
    }
    get selectedGroups(): AccessionGroup[] {
        return this._selectedGroups;
    }
    @Output() selectedGroupsChange = new EventEmitter<AccessionGroup[]>();

    @Input()
    categories: string[] = [];

    extractCategoryGroups(category: string): AccessionGroup[] {
        return this.groups.filter(grp => grp.category === category);
    }

    removeGroup(group: AccessionGroup) {
        this.groups.splice(this.groups.indexOf(group), 1);
        this.groups = [...this.groups];
    }

    changeGroupColor($event: ColorChangeEvent) {
        if (!isNullOrUndefined($event.target)) {
            $event.target.value.color = $event.color;
        }
    }
}

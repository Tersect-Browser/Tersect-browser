import {
    Component,
    EventEmitter,
    Input,
    Output,
    ViewChild,
    ViewEncapsulation
} from '@angular/core';

import {
    ColorChangeEvent,
    ColorSelectorComponent
} from '../../../color-selector/color-selector.component';
import {
    AccessionGroup
} from '../../../pages/tersect-browser/browser-settings';
import {
    isNullOrUndefined
} from '../../../shared/utils/utils';
import {
    RemoveGroupDialogComponent
} from '../remove-group-dialog/remove-group-dialog.component';

@Component({
    selector: 'app-group-box',
    templateUrl: './group-box.component.html',
    styleUrls: ['./group-box.component.css'],
    encapsulation: ViewEncapsulation.None
})
export class GroupBoxComponent {
    @ViewChild(ColorSelectorComponent, { static: true })
    readonly colorSelector: ColorSelectorComponent;

    @ViewChild(RemoveGroupDialogComponent, { static: true })
    readonly removeGroupDialog: RemoveGroupDialogComponent;

    @Input()
    categories: string[] = [];

    @Input()
    set groups(groups: AccessionGroup[]) {
        this._groups = groups;
        this.groupsChange.emit(this._groups);
    }

    @Input()
    set selectedGroups(groups: AccessionGroup[]) {
        this._selectedGroups = groups;
        this.selectedGroupsChange.emit(this._selectedGroups);
    }
    get selectedGroups(): AccessionGroup[] {
        return this._selectedGroups;
    }

    @Output() groupsChange = new EventEmitter<AccessionGroup[]>();
    get groups(): AccessionGroup[] {
        return this._groups;
    }

    @Output() selectedGroupsChange = new EventEmitter<AccessionGroup[]>();

    private _groups: AccessionGroup[];
    private _selectedGroups: AccessionGroup[];

    changeGroupColor($event: ColorChangeEvent) {
        if (!isNullOrUndefined($event.target)) {
            $event.target.value.color = $event.color;
        }
    }

    extractCategoryGroups(category: string): AccessionGroup[] {
        return this.groups.filter(grp => grp.category === category);
    }

    removeGroup(group: AccessionGroup) {
        this.groups.splice(this.groups.indexOf(group), 1);
        this.groups = [...this.groups];
    }
}

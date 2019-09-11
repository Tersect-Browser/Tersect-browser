import { AccessionGroup } from '../../introgression-browser/browser-settings';

import { Component, Input, Output, EventEmitter } from '@angular/core';
import { SelectItem } from 'primeng/components/common/selectitem';
import { isNullOrUndefined } from '../../utils/utils';

@Component({
    selector: 'app-add-group-dialog',
    templateUrl: './add-group-dialog.component.html'
})
export class AddGroupDialogComponent {
    errorMessage = '';

    private _categoryName = '';
    set category_name(name: string) {
        this._categoryName = name.trim();
    }
    get category_name(): string {
        return this._categoryName;
    }

    private _groupName = '';
    set group_name(name: string) {
        this._groupName = name.trim();
        this.validateGroupName(this._groupName);
    }
    get group_name(): string {
        return this._groupName;
    }

    @Input()
    selectedAccessions: string[];

    @Input()
    accessionGroups: AccessionGroup[];

    @Input()
    set categories(cats: string[]) {
        // Do not allow undefined category in dropdown menu
        this.categoryOptions = cats.filter(c => !isNullOrUndefined(c))
                                   .map(c => ({ label: c, value: c }));
    }
    categoryOptions: SelectItem[];

    private _visible = false;
    @Input()
    set visible(v: boolean) {
        if (this._visible !== v) {
            this._visible = v;
            this.visibleChange.emit(this._visible);
        }
    }
    get visible(): boolean {
        return this._visible;
    }
    @Output()
    visibleChange = new EventEmitter<boolean>();

    @Output()
    groupSave = new EventEmitter<AccessionGroup>();

    saveGroup() {
        const group: AccessionGroup = {
            name: this.group_name,
            accessions: this.selectedAccessions
        };
        if (!isNullOrUndefined(this.category_name)
            && this.category_name.length) {
            group.category = this.category_name;
        }
        this.groupSave.emit(group);
        this.hideDialog();
    }

    private hideDialog() {
        this.group_name = '';
        this.category_name = '';
        this.visible = false;
    }

    private validateGroupName(groupName: string) {
        if (this.accessionGroups.some(grp => grp.name === groupName)) {
            this.errorMessage = 'Group name already in use';
        } else {
            this.errorMessage = '';
        }
    }
}

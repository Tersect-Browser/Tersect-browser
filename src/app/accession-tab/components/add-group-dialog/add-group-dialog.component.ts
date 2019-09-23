import { Component, EventEmitter, Input, Output } from '@angular/core';

import { SelectItem } from 'primeng/components/common/selectitem';

import { AccessionGroup } from '../../../tersect-browser/browser-settings';
import { isNullOrUndefined } from '../../../utils/utils';

@Component({
    selector: 'app-add-group-dialog',
    templateUrl: './add-group-dialog.component.html'
})
export class AddGroupDialogComponent {
    @Input()
    accessionGroups: AccessionGroup[];

    @Input()
    set categories(cats: string[]) {
        // Do not allow undefined category in dropdown menu
        this.categoryOptions = cats.filter(c => !isNullOrUndefined(c))
                                   .map(c => ({ label: c, value: c }));
    }

    @Input()
    selectedAccessions: string[];

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
    groupSave = new EventEmitter<AccessionGroup>();

    @Output()
    visibleChange = new EventEmitter<boolean>();

    categoryOptions: SelectItem[];
    errorMessage = '';

    private _categoryName = '';
    private _groupName = '';
    private _visible = false;

    set categoryName(name: string) {
        this._categoryName = name.trim();
    }
    get categoryName(): string {
        return this._categoryName;
    }

    set groupName(name: string) {
        this._groupName = name.trim();
        this.validateGroupName(this._groupName);
    }
    get groupName(): string {
        return this._groupName;
    }

    saveGroup() {
        const group: AccessionGroup = {
            name: this.groupName,
            accessions: this.selectedAccessions
        };
        if (!isNullOrUndefined(this.categoryName)
            && this.categoryName.length) {
            group.category = this.categoryName;
        }
        this.groupSave.emit(group);
        this.hideDialog();
    }

    private hideDialog() {
        this.groupName = '';
        this.categoryName = '';
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

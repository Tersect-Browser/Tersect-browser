import { AccessionGroup } from '../accession-tab.component';

import { Component, Input, Output, EventEmitter } from '@angular/core';

@Component({
    selector: 'app-add-group-dialog',
    templateUrl: './add-group-dialog.component.html',
    styleUrls: ['./add-group-dialog.component.css']
})
export class AddGroupDialogComponent {
    category_name = '';
    error_message = '';

    _group_name = '';
    set group_name(name: string) {
        this._group_name = name;
        this.validateGroupName(this._group_name);
    }
    get group_name(): string {
        return this._group_name;
    }

    @Input()
    selectedAccessions: string[];

    @Input()
    accessionGroups: AccessionGroup[];

    @Input()
    categories: string[] = [];

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
        this.groupSave.emit({
            name: this.group_name,
            accessions: this.selectedAccessions
        });
        this.group_name = '';
        this.visible = false;
    }

    validateGroupName(group_name: string) {
        if (this.accessionGroups.some((grp) => grp.name === group_name)) {
            this.error_message = 'Group name already in use';
        } else {
            this.error_message = '';
        }
    }
}

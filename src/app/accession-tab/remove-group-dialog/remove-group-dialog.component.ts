import { AccessionGroup } from '../../introgression-browser/browser-settings';

import { Component, Output, EventEmitter } from '@angular/core';

@Component({
    selector: 'app-remove-group-dialog',
    templateUrl: './remove-group-dialog.component.html',
    styleUrls: ['./remove-group-dialog.component.css']
})
export class RemoveGroupDialogComponent {
    visible = false;
    group: AccessionGroup;

    @Output() deleteGroup = new EventEmitter<AccessionGroup>();

    show(group: AccessionGroup) {
        this.group = group;
        this.visible = true;
    }

    cancel() {
        this.visible = false;
    }

    delete() {
        this.visible = false;
        this.deleteGroup.emit(this.group);
    }
}

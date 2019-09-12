import { Component, EventEmitter, Output } from '@angular/core';

import { AccessionGroup } from '../../introgression-browser/browser-settings';

@Component({
    selector: 'app-remove-group-dialog',
    templateUrl: './remove-group-dialog.component.html'
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

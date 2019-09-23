import { Component, EventEmitter, Output } from '@angular/core';

import { AccessionGroup } from '../../../tersect-browser/browser-settings';

@Component({
    selector: 'app-remove-group-dialog',
    templateUrl: './remove-group-dialog.component.html'
})
export class RemoveGroupDialogComponent {
    @Output() deleteGroup = new EventEmitter<AccessionGroup>();

    group: AccessionGroup;
    visible = false;

    cancel() {
        this.visible = false;
    }

    delete() {
        this.visible = false;
        this.deleteGroup.emit(this.group);
    }

    show(group: AccessionGroup) {
        this.group = group;
        this.visible = true;
    }
}

import { AccessionTabComponent } from './accession-tab.component';
import { GroupBoxComponent } from './group-box/group-box.component';
import { AddGroupDialogComponent } from './add-group-dialog/add-group-dialog.component';

import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { CheckboxModule } from 'primeng/checkbox';
import { ListboxModule } from 'primeng/listbox';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { DropdownModule } from 'primeng/dropdown';
import { MessageModule } from 'primeng/message';

@NgModule({
    declarations: [
        AccessionTabComponent,
        GroupBoxComponent,
        AddGroupDialogComponent
    ],
    exports: [
        AccessionTabComponent
    ],
    imports: [
        CommonModule,
        BrowserAnimationsModule,
        FormsModule,
        TableModule,
        CheckboxModule,
        ListboxModule,
        ButtonModule,
        DialogModule,
        InputTextModule,
        DropdownModule,
        MessageModule
    ],
    providers: []
})
export class AccessionTabModule { }

import { AccessionTabComponent } from './accession-tab.component';
import { GroupBoxComponent } from './group-box/group-box.component';

import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { CheckboxModule } from 'primeng/checkbox';
import { ListboxModule } from 'primeng/listbox';

@NgModule({
    declarations: [
        AccessionTabComponent,
        GroupBoxComponent
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
        ListboxModule
    ],
    providers: []
})
export class AccessionTabModule { }

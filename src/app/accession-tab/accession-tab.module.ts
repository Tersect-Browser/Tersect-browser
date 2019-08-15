import { AccessionTabComponent } from './accession-tab.component';

import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { CheckboxModule } from 'primeng/checkbox';
import { ListboxModule } from 'primeng/listbox';

@NgModule({
    declarations: [
        AccessionTabComponent
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

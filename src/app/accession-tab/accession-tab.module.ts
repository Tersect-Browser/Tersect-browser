import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';

import { AccordionModule } from 'primeng/accordion';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { DialogModule } from 'primeng/dialog';
import { DropdownModule } from 'primeng/dropdown';
import { InputTextModule } from 'primeng/inputtext';
import { ListboxModule } from 'primeng/listbox';
import { MessageModule } from 'primeng/message';
import { TableModule } from 'primeng/table';

import {
    ColorSelectorModule
} from '../color-selector/color-selector.module';
import {
    InputAutocompleteModule
} from '../input-autocomplete/input-autocomplete.module';
import {
    TGRCGeneImporterModule
} from '../tgrc-gene-importer/tgrc-gene-importer.module';

import {
    FitWindowModule
} from '../shared/directives/fit-window/fit-window.module';
import {
    TGRCGeneImporterComponent
} from '../tgrc-gene-importer/tgrc-gene-importer.component';
import {
    AccessionTabComponent
} from './accession-tab.component';
import {
    AddGroupDialogComponent
} from './components/add-group-dialog/add-group-dialog.component';
import {
    GroupBoxComponent
} from './components/group-box/group-box.component';
import {
    RemoveGroupDialogComponent
} from './components/remove-group-dialog/remove-group-dialog.component';

@NgModule({
    declarations: [
        AccessionTabComponent,
        GroupBoxComponent,
        AddGroupDialogComponent,
        RemoveGroupDialogComponent
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
        MessageModule,
        AccordionModule,
        ColorSelectorModule,
        FitWindowModule,
        InputAutocompleteModule,
        TGRCGeneImporterModule
    ],
    entryComponents: [
        TGRCGeneImporterComponent
    ]
})
export class AccessionTabModule { }

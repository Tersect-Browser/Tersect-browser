import { AccessionTabComponent } from './accession-tab.component';
import { GroupBoxComponent } from './group-box/group-box.component';
import { AddGroupDialogComponent } from './add-group-dialog/add-group-dialog.component';
import { RemoveGroupDialogComponent } from './remove-group-dialog/remove-group-dialog.component';
import { ColorSelectorModule } from '../color-selector/color-selector.module';
import { FitWindowModule } from '../directives/fit-window/fit-window.module';

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
import { AccordionModule } from 'primeng/accordion';
import { InputAutocompleteModule } from '../input-autocomplete/input-autocomplete.module';
import { TGRCGeneImporterModule } from '../tgrc-gene-importer/tgrc-gene-importer.module';
import { TGRCGeneImporterComponent } from '../tgrc-gene-importer/tgrc-gene-importer.component';

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

import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';

import { DropdownModule } from 'primeng/dropdown';

import { TGRCBackendService } from '../../services/tgrc-backend.service';

import { TGRCGeneImporterComponent } from './tgrc-gene-importer.component';

@NgModule({
    declarations: [
        TGRCGeneImporterComponent
    ],
    exports: [
        TGRCGeneImporterComponent
    ],
    imports: [
        CommonModule,
        BrowserAnimationsModule,
        FormsModule,
        DropdownModule
    ],
    providers: [
        TGRCBackendService
    ]
})
export class TGRCGeneImporterModule { }

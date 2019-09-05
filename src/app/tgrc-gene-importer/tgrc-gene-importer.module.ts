import { TGRCBackendService } from '../services/tgrc-backend.service';
import { NgModule } from '@angular/core';
import { TGRCGeneImporterComponent } from './tgrc-gene-importer.component';
import { CommonModule } from '@angular/common';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { FormsModule } from '@angular/forms';
import { DropdownModule } from 'primeng/dropdown';

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

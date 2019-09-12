import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { ProgressSpinnerModule } from 'primeng/progressspinner';

import { TersectBackendService } from '../services/tersect-backend.service';

import { AccessionBarComponent } from './accession-bar/accession-bar.component';
import { BinPlotComponent } from './bin-plot/bin-plot.component';
import { IntrogressionPlotComponent } from './introgression-plot.component';
import { ScaleBarComponent } from './scale-bar/scale-bar.component';

@NgModule({
    declarations: [
        IntrogressionPlotComponent,
        ScaleBarComponent,
        AccessionBarComponent,
        BinPlotComponent
    ],
    exports: [
        IntrogressionPlotComponent
    ],
    imports: [
        CommonModule,
        ProgressSpinnerModule
    ],
    providers: [
        TersectBackendService
    ]
})
export class IntrogressionPlotModule { }

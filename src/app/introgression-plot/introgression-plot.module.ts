import { IntrogressionPlotComponent } from './introgression-plot.component';
import { ScaleBarComponent } from './scale-bar/scale-bar.component';
import { AccessionBarComponent } from './accession-bar/accession-bar.component';
import { BinPlotComponent } from './bin-plot/bin-plot.component';
import { PlotStateService } from './services/plot-state.service';
import { TersectBackendService } from '../services/tersect-backend.service';

import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProgressSpinnerModule } from 'primeng/progressspinner';

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
        TersectBackendService,
        PlotStateService
    ]
})
export class IntrogressionPlotModule { }

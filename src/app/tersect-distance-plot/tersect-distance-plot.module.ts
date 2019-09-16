import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { ProgressSpinnerModule } from 'primeng/progressspinner';

import { TersectBackendService } from '../services/tersect-backend.service';

import { BinPlotComponent } from './bin-plot/bin-plot.component';
import { ScaleBarComponent } from './scale-bar/scale-bar.component';
import { TersectDistancePlotComponent } from './tersect-distance-plot.component';
import { TreePlotComponent } from './tree-plot/tree-plot.component';

@NgModule({
    declarations: [
        TersectDistancePlotComponent,
        ScaleBarComponent,
        TreePlotComponent,
        BinPlotComponent
    ],
    exports: [
        TersectDistancePlotComponent
    ],
    imports: [
        CommonModule,
        ProgressSpinnerModule
    ],
    providers: [
        TersectBackendService
    ]
})
export class TersectDistancePlotModule { }

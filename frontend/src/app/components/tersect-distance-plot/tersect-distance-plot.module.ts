import { CommonModule } from '@angular/common';
import { CUSTOM_ELEMENTS_SCHEMA, NgModule } from '@angular/core';
import { ProgressSpinnerModule } from 'primeng/progressspinner';

import {
    TersectBackendService
} from '../../services/tersect-backend.service';

import {
    BinPlotComponent
} from './components/bin-plot/bin-plot.component';
import {
    ScaleBarComponent
} from './components/scale-bar/scale-bar.component';
import {
    TreePlotComponent
} from './components/tree-plot/tree-plot.component';
import {
    TersectDistancePlotComponent
} from './tersect-distance-plot.component';

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
    ],
    schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class TersectDistancePlotModule { }

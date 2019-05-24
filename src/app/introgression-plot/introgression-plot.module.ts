import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { ProgressSpinnerModule } from 'primeng/progressspinner';

import { TersectBackendService } from '../services/tersect-backend.service';

import { IntrogressionPlotComponent } from './introgression-plot.component';


@NgModule({
    declarations: [
        IntrogressionPlotComponent
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

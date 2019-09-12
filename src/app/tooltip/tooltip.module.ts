import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';

import { FitWindowModule } from '../directives/fit-window/fit-window.module';

import { TooltipComponent } from './tooltip.component';

@NgModule({
    declarations: [
        TooltipComponent
    ],
    exports: [
        TooltipComponent
    ],
    imports: [
        CommonModule,
        FitWindowModule
    ]
})
export class TooltipModule { }

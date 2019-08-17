import { TooltipComponent } from './tooltip.component';
import { FitWindowModule } from '../directives/fit-window/fit-window.module';

import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

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

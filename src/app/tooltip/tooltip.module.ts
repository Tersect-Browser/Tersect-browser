import { TooltipComponent } from './tooltip.component';

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
        CommonModule
    ]
})
export class TooltipModule { }

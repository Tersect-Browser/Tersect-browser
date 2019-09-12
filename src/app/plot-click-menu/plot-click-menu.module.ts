import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { MenuModule } from 'primeng/menu';

import { PlotClickMenuComponent } from './plot-click-menu.component';

@NgModule({
    declarations: [
        PlotClickMenuComponent
    ],
    exports: [
        PlotClickMenuComponent
    ],
    imports: [
        CommonModule,
        MenuModule
    ]
})
export class PlotClickMenuModule { }

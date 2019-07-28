import { PlotClickMenuComponent } from './plot-click-menu.component';

import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MenuModule } from 'primeng/menu';

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

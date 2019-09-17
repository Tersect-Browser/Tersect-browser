import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';

import { ButtonModule } from 'primeng/button';
import { DropdownModule } from 'primeng/dropdown';
import { KeyFilterModule } from 'primeng/keyfilter';
import { OverlayPanelModule } from 'primeng/overlaypanel';
import { RadioButtonModule } from 'primeng/radiobutton';
import { SidebarModule } from 'primeng/sidebar';
import { SliderModule } from 'primeng/slider';
import { ToggleButtonModule } from 'primeng/togglebutton';
import { ToolbarModule } from 'primeng/toolbar';

import {
    AccessionTabModule
} from '../accession-tab/accession-tab.module';
import {
    FitWindowModule
} from '../directives/fit-window/fit-window.module';
import {
    PlotClickMenuModule
} from '../plot-click-menu/plot-click-menu.module';
import {
    TersectDistancePlotModule
} from '../tersect-distance-plot/tersect-distance-plot.module';
import {
    TooltipModule
} from '../tooltip/tooltip.module';

import {
    AccessionStyleSelectorComponent
} from './accession-style-selector/accession-style-selector.component';
import {
    BinsizeSelectorComponent
} from './binsize-selector/binsize-selector.component';
import {
    ChromosomeSelectorComponent
} from './chromosome-selector/chromosome-selector.component';
import {
    IntervalSelectorComponent
} from './interval-selector/interval-selector.component';
import {
    ReferenceSelectorComponent
} from './reference-selector/reference-selector.component';
import {
    ShareMenuComponent
} from './share-menu/share-menu.component';
import {
    TersectBrowserComponent
} from './tersect-browser.component';

@NgModule({
    declarations: [
        TersectBrowserComponent,
        AccessionStyleSelectorComponent,
        ReferenceSelectorComponent,
        ChromosomeSelectorComponent,
        IntervalSelectorComponent,
        BinsizeSelectorComponent,
        ShareMenuComponent
    ],
    exports: [
        TersectBrowserComponent
    ],
    imports: [
        CommonModule,
        BrowserAnimationsModule,
        FormsModule,
        ButtonModule,
        SidebarModule,
        DropdownModule,
        ToolbarModule,
        SliderModule,
        KeyFilterModule,
        ToggleButtonModule,
        OverlayPanelModule,
        RadioButtonModule,
        TersectDistancePlotModule,
        PlotClickMenuModule,
        TooltipModule,
        AccessionTabModule,
        FitWindowModule
    ]
})
export class TersectBrowserModule { }

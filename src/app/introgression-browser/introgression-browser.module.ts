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
    IntrogressionPlotModule
} from '../introgression-plot/introgression-plot.module';
import {
    PlotClickMenuModule
} from '../plot-click-menu/plot-click-menu.module';
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
    IntrogressionBrowserComponent
} from './introgression-browser.component';
import {
    ReferenceSelectorComponent
} from './reference-selector/reference-selector.component';
import {
    ShareButtonComponent
} from './share-button/share-button.component';

@NgModule({
    declarations: [
        IntrogressionBrowserComponent,
        AccessionStyleSelectorComponent,
        ReferenceSelectorComponent,
        ChromosomeSelectorComponent,
        IntervalSelectorComponent,
        BinsizeSelectorComponent,
        ShareButtonComponent
    ],
    exports: [
        IntrogressionBrowserComponent
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
        IntrogressionPlotModule,
        PlotClickMenuModule,
        TooltipModule,
        AccessionTabModule,
        FitWindowModule
    ]
})
export class IntrogressionBrowserModule { }

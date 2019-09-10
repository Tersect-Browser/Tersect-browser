import { IntrogressionPlotModule } from '../introgression-plot/introgression-plot.module';
import { AccessionTabModule } from '../accession-tab/accession-tab.module';

import { IntrogressionBrowserComponent } from './introgression-browser.component';

import { PlotClickMenuModule } from '../plot-click-menu/plot-click-menu.module';
import { TooltipModule } from '../tooltip/tooltip.module';
import { FitWindowModule } from '../directives/fit-window/fit-window.module';

import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { SidebarModule } from 'primeng/sidebar';
import { DropdownModule } from 'primeng/dropdown';
import { ToolbarModule } from 'primeng/toolbar';
import { SliderModule } from 'primeng/slider';
import { KeyFilterModule } from 'primeng/keyfilter';
import { ToggleButtonModule } from 'primeng/togglebutton';
import { OverlayPanelModule } from 'primeng/overlaypanel';
import { RadioButtonModule } from 'primeng/radiobutton';
import { AccessionStyleSelectorComponent } from './accession-style-selector/accession-style-selector.component';
import { ReferenceSelectorComponent } from './reference-selector/reference-selector.component';
import { ChromosomeSelectorComponent } from './chromosome-selector/chromosome-selector.component';
import { IntervalSelectorComponent } from './interval-selector/interval-selector.component';
import { BinsizeSelectorComponent } from './binsize-selector/binsize-selector.component';

@NgModule({
    declarations: [
        IntrogressionBrowserComponent,
        AccessionStyleSelectorComponent,
        ReferenceSelectorComponent,
        ChromosomeSelectorComponent,
        IntervalSelectorComponent,
        BinsizeSelectorComponent
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
    ],
    providers: []
})
export class IntrogressionBrowserModule { }

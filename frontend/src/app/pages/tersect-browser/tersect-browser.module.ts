import { CommonModule } from '@angular/common';
import { CUSTOM_ELEMENTS_SCHEMA, NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';

import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { DropdownModule } from 'primeng/dropdown';
import { KeyFilterModule } from 'primeng/keyfilter';
import { OverlayPanelModule } from 'primeng/overlaypanel';
import { ProgressBarModule } from 'primeng/progressbar';
import { RadioButtonModule } from 'primeng/radiobutton';
import { SidebarModule } from 'primeng/sidebar';
import { SliderModule } from 'primeng/slider';
import { SpinnerModule } from 'primeng/spinner';
import { TabViewModule } from 'primeng/tabview';
import { ToggleButtonModule } from 'primeng/togglebutton';
import { ToolbarModule } from 'primeng/toolbar';

import {
    AccessionTabModule
} from '../../components/accession-tab/accession-tab.module';
import {
    PlotClickMenuModule
} from '../../components/plot-click-menu/plot-click-menu.module';
import {
    TersectDistancePlotModule
} from '../../components/tersect-distance-plot/tersect-distance-plot.module';
import {
    TooltipModule
} from '../../components/tooltip/tooltip.module';
import {
    FitWindowModule
} from '../../directives/fit-window/fit-window.module';

import {
    MessageModule
} from 'primeng/message';
import {
    SharedPipesModule
} from '../../pipes/shared-pipes.module';
import {
    AccessionStyleSelectorComponent
} from './components/accession-style-selector/accession-style-selector.component';
import {
    BinsizeSelectorComponent
} from './components/binsize-selector/binsize-selector.component';
import {
    ChromosomeSelectorComponent
} from './components/chromosome-selector/chromosome-selector.component';
import {
    DownloadDialogComponent
} from './components/download-dialog/download-dialog.component';
import {
    IntervalSelectorComponent
} from './components/interval-selector/interval-selector.component';
import {
    ReferenceSelectorComponent
} from './components/reference-selector/reference-selector.component';
import {
    ShareMenuComponent
} from './components/share-menu/share-menu.component';
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
        ShareMenuComponent,
        DownloadDialogComponent
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
        FitWindowModule,
        TabViewModule,
        DialogModule,
        SpinnerModule,
        SharedPipesModule,
        ProgressBarModule,
        MessageModule
    ],
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class TersectBrowserModule { }

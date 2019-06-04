import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { NgModule } from '@angular/core';

import { AppComponent } from './app.component';

import { ButtonModule } from 'primeng/button';
import { SidebarModule } from 'primeng/sidebar';
import { DropdownModule } from 'primeng/dropdown';
import { ToolbarModule } from 'primeng/toolbar';
import { SliderModule } from 'primeng/slider';
import { ListboxModule } from 'primeng/listbox';
import { KeyFilterModule } from 'primeng/keyfilter';
import { ToggleButtonModule } from 'primeng/togglebutton';

import { HttpClient, HttpClientModule } from '@angular/common/http';
import { TersectBackendService } from './services/tersect-backend.service';
import { FormsModule } from '@angular/forms';

import { IntrogressionPlotModule } from './introgression-plot/introgression-plot.module';
import { PlotClickMenuModule } from './plot-click-menu/plot-click-menu.module';
import { TooltipModule } from './tooltip/tooltip.module';

@NgModule({
    declarations: [
        AppComponent
    ],
    imports: [
        HttpClientModule,
        BrowserModule,
        BrowserAnimationsModule,
        FormsModule,
        ButtonModule,
        SidebarModule,
        DropdownModule,
        ToolbarModule,
        SliderModule,
        ListboxModule,
        KeyFilterModule,
        ToggleButtonModule,
        IntrogressionPlotModule,
        PlotClickMenuModule,
        TooltipModule
    ],
    providers: [
        HttpClient,
        TersectBackendService
    ],
    bootstrap: [AppComponent]
})
export class AppModule { }

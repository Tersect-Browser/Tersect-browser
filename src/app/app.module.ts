import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { NgModule } from '@angular/core';

import { AppComponent } from './app.component';

import { ButtonModule } from 'primeng/button';
import { SidebarModule } from 'primeng/sidebar';
import { DropdownModule } from 'primeng/dropdown';
import { ToolbarModule } from 'primeng/toolbar';
import { SliderModule } from 'primeng/slider';
import { ProgressSpinnerModule } from 'primeng/progressspinner';

import { IntrogressionPlotComponent } from './introgression-plot/introgression-plot.component';

import { HttpClient, HttpClientModule } from '@angular/common/http';
import { TersectBackendService } from './services/tersect-backend.service';
import { FormsModule } from '@angular/forms';

@NgModule({
  declarations: [
    AppComponent,
    IntrogressionPlotComponent
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
    ProgressSpinnerModule
  ],
  providers: [
    HttpClient,
    TersectBackendService
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }

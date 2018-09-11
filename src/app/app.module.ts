import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { NgModule } from '@angular/core';

import { AppComponent } from './app.component';

import { ButtonModule } from 'primeng/button';
import { SidebarModule } from 'primeng/sidebar';
import { DropdownModule } from 'primeng/dropdown';

import { IntrogressionPlotComponent } from './introgression-plot/introgression-plot.component';

import { HttpClient, HttpClientModule } from '@angular/common/http';
import { TersectBackendService } from './services/tersect-backend.service';

@NgModule({
  declarations: [
    AppComponent,
    IntrogressionPlotComponent
  ],
  imports: [
    HttpClientModule,
    BrowserModule,
    BrowserAnimationsModule,
    ButtonModule,
    SidebarModule,
    DropdownModule
  ],
  providers: [
    HttpClient,
    TersectBackendService
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }

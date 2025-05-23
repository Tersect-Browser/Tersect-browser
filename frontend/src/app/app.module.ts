import { HttpClient, HttpClientModule } from '@angular/common/http';
import { NgModule, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { RouterModule, Routes } from '@angular/router';
import { ProgressSpinnerModule } from 'primeng/progressspinner';

import {
    IntroPageModule
} from './pages/intro-page/intro-page.module';
import {
    TersectBrowserModule
} from './pages/tersect-browser/tersect-browser.module';

import {
    AppComponent
} from './app.component';
import {
    IntroPageComponent
} from './pages/intro-page/intro-page.component';
import {
    TersectBrowserComponent
} from './pages/tersect-browser/tersect-browser.component';

import { APP_CONFIG, TERSECT_BROWSER_CONFIG } from './app.config';
import { GlobalModalComponent } from './components/global-jbrowse-modal/global-modal.component';
import { GlobalBarcodeComponent } from './components/global-barcode-modal/global-barcode.component';
import { DialogModule } from 'primeng/dialog';
import { FormsModule } from '@angular/forms';

const appRoutes: Routes = [
    { path: 'share/:exportid', component: TersectBrowserComponent },
    { path: '', component: IntroPageComponent, pathMatch: 'full' },
    { path: '**', redirectTo: '' }
];

@NgModule({
    declarations: [
        AppComponent,
        GlobalModalComponent,
        GlobalBarcodeComponent,
    ],
    imports: [
        BrowserAnimationsModule,
        HttpClientModule,
        BrowserModule,
        IntroPageModule,
        TersectBrowserModule,
        DialogModule,
        RouterModule.forRoot(appRoutes),
        FormsModule,
        ProgressSpinnerModule
    ],
    providers: [
        HttpClient,
        { provide: APP_CONFIG, useValue: TERSECT_BROWSER_CONFIG }
    ],
    bootstrap: [AppComponent],
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class AppModule { }

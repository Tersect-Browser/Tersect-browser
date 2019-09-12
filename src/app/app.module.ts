import { HttpClient, HttpClientModule } from '@angular/common/http';
import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { RouterModule, Routes } from '@angular/router';

import {
    IntroPageModule
} from './intro-page/intro-page.module';
import {
    IntrogressionBrowserModule
} from './introgression-browser/introgression-browser.module';

import {
    AppComponent
} from './app.component';
import {
    IntroPageComponent
} from './intro-page/intro-page.component';
import {
    IntrogressionBrowserComponent
} from './introgression-browser/introgression-browser.component';

import { APP_CONFIG, TERSECT_BROWSER_CONFIG } from './app.config';

const appRoutes: Routes = [
    { path: 'share/:exportid', component: IntrogressionBrowserComponent },
    { path: '', component: IntroPageComponent, pathMatch: 'full' },
    { path: '**', redirectTo: '' }
];

@NgModule({
    declarations: [
        AppComponent
    ],
    imports: [
        BrowserAnimationsModule,
        HttpClientModule,
        BrowserModule,
        IntroPageModule,
        IntrogressionBrowserModule,
        RouterModule.forRoot(appRoutes)
    ],
    providers: [
        HttpClient,
        { provide: APP_CONFIG, useValue: TERSECT_BROWSER_CONFIG }
    ],
    bootstrap: [AppComponent]
})
export class AppModule { }

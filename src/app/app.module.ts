import { HttpClient, HttpClientModule } from '@angular/common/http';
import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { RouterModule, Routes } from '@angular/router';

import {
    IntroPageModule
} from './intro-page/intro-page.module';
import {
    TersectBrowserModule
} from './tersect-browser/tersect-browser.module';

import {
    AppComponent
} from './app.component';
import {
    IntroPageComponent
} from './intro-page/intro-page.component';
import {
    TersectBrowserComponent
} from './tersect-browser/tersect-browser.component';

import { APP_CONFIG, TERSECT_BROWSER_CONFIG } from './app.config';

const appRoutes: Routes = [
    { path: 'share/:exportid', component: TersectBrowserComponent },
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
        TersectBrowserModule,
        RouterModule.forRoot(appRoutes)
    ],
    providers: [
        HttpClient,
        { provide: APP_CONFIG, useValue: TERSECT_BROWSER_CONFIG }
    ],
    bootstrap: [AppComponent]
})
export class AppModule { }

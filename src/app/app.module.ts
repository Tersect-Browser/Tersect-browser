import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { RouterModule, Routes } from '@angular/router';

import { IntrogressionBrowserModule } from './introgression-browser/introgression-browser.module';

import { IntrogressionBrowserComponent } from './introgression-browser/introgression-browser.component';

import { AppComponent } from './app.component';

const appRoutes: Routes = [
    { path: 'share/:exportid', component: IntrogressionBrowserComponent },
    { path: '', component: IntrogressionBrowserComponent, pathMatch: 'full' },
    { path: '**', redirectTo: '' }
];

@NgModule({
    declarations: [
        AppComponent
    ],
    imports: [
        HttpClientModule,
        BrowserModule,
        IntrogressionBrowserModule,
        RouterModule.forRoot(appRoutes)
    ],
    providers: [
        HttpClient
    ],
    bootstrap: [AppComponent]
})
export class AppModule { }

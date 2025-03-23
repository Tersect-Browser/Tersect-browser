#!/bin/bash

set -e

APP_DIR="./tersect-ng19/src/app"

echo "⚙️ Adjusting Angular module config..."

# 1. Create app-routing.module.ts
cat <<EOF > "$APP_DIR/app-routing.module.ts"
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { IntroPageComponent } from './pages/intro-page/intro-page.component';
import { TersectBrowserComponent } from './pages/tersect-browser/tersect-browser.component';

const routes: Routes = [
  { path: '', redirectTo: 'intro', pathMatch: 'full' },
  { path: 'intro', component: IntroPageComponent },
  { path: 'browser/:id', component: TersectBrowserComponent },
  { path: '**', redirectTo: 'intro' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule {}
EOF

# 2. Rewrite app.module.ts
cat <<EOF > "$APP_DIR/app.module.ts"
import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';

import { AppComponent } from './app.component';
import { AppRoutingModule } from './app-routing.module';

// Pages
import { IntroPageComponent } from './pages/intro-page/intro-page.component';
import { TersectBrowserComponent } from './pages/tersect-browser/tersect-browser.component';

// Shared Modules
import { PipesModule } from './pipes/pipes.module';
import { FitWindowDirective } from './directives/fit-window/fit-window.directive';
import { TooltipComponent } from './components/tooltip/tooltip.component';

// PrimeNG Modules
import { TableModule } from 'primeng/table';
import { DropdownModule } from 'primeng/dropdown';
import { ButtonModule } from 'primeng/button';
import { AutoCompleteModule } from 'primeng/autocomplete';
import { DialogModule } from 'primeng/dialog';

@NgModule({
  declarations: [
    AppComponent,
    IntroPageComponent,
    TersectBrowserComponent,
    TooltipComponent,
    FitWindowDirective
  ],
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    FormsModule,
    HttpClientModule,
    AppRoutingModule,
    PipesModule,
    TableModule,
    DropdownModule,
    ButtonModule,
    AutoCompleteModule,
    DialogModule
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule {}
EOF

echo "✅ Module setup complete."

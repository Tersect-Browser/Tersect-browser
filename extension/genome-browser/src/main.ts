import 'zone.js';
import { createCustomElement } from '@angular/elements';
import { createApplication } from '@angular/platform-browser';
import { provideZoneChangeDetection } from '@angular/core';
import { provideAnimations } from '@angular/platform-browser/animations';
import { providePrimeNG } from 'primeng/config';
import Aura from '@primeng/themes/aura'; // or whichever theme preset

import { AppComponent } from './app/app.component';
import { GeneSearchComponent } from './app/gene-search/gene-search.component';

(async () => {
  const app = await createApplication({
    providers: [
      provideZoneChangeDetection({ eventCoalescing: true }),
      provideAnimations(),
      // If you’re using other modules that must be globally available, do:
      // importProvidersFrom(BrowserModule, BrowserAnimationsModule),
      providePrimeNG({
        theme: {
          preset: Aura
        }
      })
    ]
  });

  // Create and define custom elements
  const AppElement = createCustomElement(AppComponent, { injector: app.injector });
  customElements.define('jbrowser-wrapper', AppElement);

  const GeneSearchElement = createCustomElement(GeneSearchComponent, { injector: app.injector });
  customElements.define('gene-search', GeneSearchElement);
})();

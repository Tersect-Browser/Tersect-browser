
import 'zone.js';
import { createCustomElement } from '@angular/elements';
import { createApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';

import { GeneSearchComponent } from './app/gene-search/gene-search.component';

(async () => {
  // Create an Angular application context (no root component needed)
  const app = await createApplication({
    providers: []  // you can provide services if needed
  });
  // Convert the Angular component to a custom element class
  const JbrowserElement = createCustomElement(AppComponent, { injector: app.injector });
  // Define the custom element tag name
  customElements.define('jbrowser-wrapper', JbrowserElement);


  const GeneSearchElement = createCustomElement(GeneSearchComponent, { injector: app.injector });
  customElements.define('gene-search', GeneSearchElement);
})();


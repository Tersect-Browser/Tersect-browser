import { NgModule } from '@angular/core';

import { FitWindowDirective } from './fit-window.directive';

@NgModule({
    declarations: [
        FitWindowDirective
    ],
    exports: [
        FitWindowDirective
    ]
})
export class FitWindowModule { }

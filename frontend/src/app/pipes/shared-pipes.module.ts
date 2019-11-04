import { NgModule } from '@angular/core';

import { UnitPipe } from './unit.pipe';

@NgModule({
    declarations: [
        UnitPipe
    ],
    exports: [
        UnitPipe
    ]
})
export class SharedPipesModule { }

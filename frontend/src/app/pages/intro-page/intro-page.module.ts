import { CommonModule } from '@angular/common';
import { CUSTOM_ELEMENTS_SCHEMA, NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';

import { CardModule } from 'primeng/card';

import {
    TersectBackendService
} from '../../services/tersect-backend.service';

import { IntroPageComponent } from './intro-page.component';

@NgModule({
    declarations: [
        IntroPageComponent
    ],
    exports: [
        IntroPageComponent
    ],
    imports: [
        CommonModule,
        RouterModule,
        CardModule
    ],
    providers: [
        TersectBackendService
    ],
    schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class IntroPageModule { }

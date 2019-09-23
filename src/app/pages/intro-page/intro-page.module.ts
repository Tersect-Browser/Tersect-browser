import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
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
    ]
})
export class IntroPageModule { }

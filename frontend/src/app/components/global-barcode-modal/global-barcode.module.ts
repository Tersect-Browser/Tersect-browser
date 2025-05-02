import { Component, ViewChild, ElementRef, OnInit } from '@angular/core';
import { ModalService } from '../../pages/tersect-browser/services/modal.service';
import { CommonModule } from '@angular/common';
import { CUSTOM_ELEMENTS_SCHEMA, NgModule } from '@angular/core';
import { PlotStateService } from '../tersect-distance-plot/services/plot-state.service';
import { GlobalBarcodeComponent } from './global-barcode.component';



@NgModule({
    declarations: [

    ],
    exports: [
        GlobalBarcodeComponent
    ],
    imports: [
        CommonModule,
    ],
    providers: [
        PlotStateService
    ],
    schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class GlobalBarcodeModule { }

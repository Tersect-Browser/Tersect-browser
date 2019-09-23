import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ButtonModule } from 'primeng/button';
import { ColorPickerModule } from 'primeng/colorpicker';
import { PanelModule } from 'primeng/panel';

import { ColorPaletteComponent } from './color-palette/color-palette.component';
import { ColorSelectorComponent } from './color-selector.component';

@NgModule({
    declarations: [
        ColorSelectorComponent,
        ColorPaletteComponent
    ],
    exports: [
        ColorSelectorComponent
    ],
    imports: [
        CommonModule,
        FormsModule,
        ColorPickerModule,
        PanelModule,
        ButtonModule
    ]
})
export class ColorSelectorModule { }

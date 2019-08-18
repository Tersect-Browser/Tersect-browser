import { ColorSelectorComponent } from './color-selector.component';
import { ColorPaletteComponent } from './color-palette/color-palette.component';

import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ColorPickerModule } from 'primeng/colorpicker';
import { PanelModule } from 'primeng/panel';
import { ButtonModule } from 'primeng/button';

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

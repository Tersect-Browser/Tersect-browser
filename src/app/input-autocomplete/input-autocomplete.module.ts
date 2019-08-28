import { InputAutocompleteComponent } from './input-autocomplete.component';

import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { FormsModule } from '@angular/forms';
import { AutoCompleteModule } from 'primeng/autocomplete';

@NgModule({
    declarations: [
        InputAutocompleteComponent
    ],
    exports: [
        InputAutocompleteComponent
    ],
    imports: [
        CommonModule,
        BrowserAnimationsModule,
        FormsModule,
        AutoCompleteModule
    ]
})
export class InputAutocompleteModule { }

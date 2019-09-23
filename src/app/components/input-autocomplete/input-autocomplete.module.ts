import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';

import { AutoCompleteModule } from 'primeng/autocomplete';

import { InputAutocompleteComponent } from './input-autocomplete.component';

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

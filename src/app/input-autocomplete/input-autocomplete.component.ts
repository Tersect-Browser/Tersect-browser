import { Component, Input, Output, EventEmitter, ViewChild } from '@angular/core';
import { AutoComplete } from 'primeng/autocomplete';

@Component({
    selector: 'app-input-autocomplete',
    templateUrl: './input-autocomplete.component.html',
    styleUrls: ['./input-autocomplete.component.css']
})
export class InputAutocompleteComponent {
    @ViewChild(AutoComplete, { static: true }) ac: AutoComplete;

    @Input()
    options: string[];

    @Output()
    valueChange = new EventEmitter<string>();

    _value: string;
    set value(value: string) {
        this.valueChange.emit(value);
        this._value = value;
    }
    get value(): string {
        return this._value;
    }

    suggestions: string[];

    updateSuggestions($event: { originalEvent: Event, query: string }) {
        const query = $event.query.toUpperCase();
        this.suggestions = this.options.filter(
            option => option.toUpperCase().includes(query)
        ).sort();
    }

}

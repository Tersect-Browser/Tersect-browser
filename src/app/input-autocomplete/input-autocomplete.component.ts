import {
    Component,
    EventEmitter,
    Input,
    Output,
    ViewChild,
    ViewEncapsulation
} from '@angular/core';

import { AutoComplete } from 'primeng/autocomplete';

@Component({
    selector: 'app-input-autocomplete',
    templateUrl: './input-autocomplete.component.html',
    styleUrls: ['./input-autocomplete.component.css'],
    encapsulation: ViewEncapsulation.None
})
export class InputAutocompleteComponent {
    @ViewChild(AutoComplete, { static: true })
    readonly ac: AutoComplete;

    @Input()
    appendTo = null;

    @Input()
    options: string[];

    @Output()
    valueChange = new EventEmitter<string>();

    private _value: string;
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

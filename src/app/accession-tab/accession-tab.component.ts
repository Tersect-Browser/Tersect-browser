import { Component, Output, EventEmitter, Input, OnInit, ViewEncapsulation } from '@angular/core';
import { isNullOrUndefined } from 'util';

import { TableState } from 'primeng/components/common/tablestate';

export interface AccessionRow {
    id?: string;
    name?: string;
}

@Component({
    selector: 'app-accession-tab',
    templateUrl: './accession-tab.component.html',
    styleUrls: ['./accession-tab.component.css'],
    encapsulation: ViewEncapsulation.None
})
export class AccessionTabComponent implements OnInit {
    @Output() updateAccessions = new EventEmitter<string[]>();

    _selectedAccessions: string[];
    @Input()
    set selectedAccessions(accessions: string[]) {
        this._selectedAccessions = accessions;
        if (!isNullOrUndefined(this.accession_options)) {
            this.all_selected = this.accession_options.length
                                === this.selectedAccessions.length;
        }
        this.selectedAccessionsChange.emit(this._selectedAccessions);
    }
    get selectedAccessions(): string[] {
        return this._selectedAccessions;
    }
    @Output() selectedAccessionsChange = new EventEmitter();

    @Input()
    accession_options: AccessionRow[];

    filtered_accessions: AccessionRow[];
    virtual_accession_rows: AccessionRow[];

    cols: any[];

    all_selected: boolean;

    constructor() { }

    ngOnInit() {
        this.filtered_accessions = this.accession_options;
        this.virtual_accession_rows = this.filtered_accessions.slice(0, 100);
        this.cols = [
            { field: 'name', header: 'Name' }
        ];
        this.all_selected = this.accession_options.length
                            === this.selectedAccessions.length;
    }

    headerCheckboxChange($event: boolean) {
        if ($event) {
            this.selectedAccessions = this.accession_options.map(acc => acc.id);
        } else {
            this.selectedAccessions = [];
        }
    }

    loadDataOnScroll($event: TableState) {
        this.filtered_accessions = this.accession_options;
        for (const filter_field of Object.keys($event.filters)) {
            const contains = $event.filters[filter_field].value.toUpperCase();
            this.filtered_accessions = this.filtered_accessions.filter(acc => {
                return acc[filter_field].toUpperCase().includes(contains);
            });
        }
        this.virtual_accession_rows = this.filtered_accessions
                                          .slice($event.first,
                                                 $event.first + $event.rows);
    }
}

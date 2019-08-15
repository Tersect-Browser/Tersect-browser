import { TableState } from 'primeng/components/common/tablestate';

import { Component, Output, EventEmitter, Input, OnInit, ViewEncapsulation } from '@angular/core';
import { isNullOrUndefined } from 'util';
import { FilterMetadata } from 'primeng/components/common/filtermetadata';
import * as deepEqual from 'fast-deep-equal';
import { deepCopy, isSubset, arrayUnion, arraySubtract } from '../utils/utils';
import { SelectItem } from 'primeng/components/common/selectitem';

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
        this.updateAllSelected();
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

    previous_filters: {
        [s: string]: FilterMetadata;
    } = {};

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
        const filtered_acc_ids = this.filtered_accessions.map(acc => acc.id);
        if ($event) {
            // Checking all matching accessions
            this.selectedAccessions = arrayUnion(this.selectedAccessions,
                                                 filtered_acc_ids);
        } else {
            // Unchecking all matching accessions
            this.selectedAccessions = arraySubtract(this.selectedAccessions,
                                                    filtered_acc_ids);
        }
    }

    updateAllSelected() {
        if (!isNullOrUndefined(this.filtered_accessions)) {
            this.all_selected = isSubset(this.filtered_accessions
                                             .map(acc => acc.id),
                                         this.selectedAccessions);
        }
    }

    filtersUsed(): boolean {
        return this.filtered_accessions.length
               !== this.accession_options.length;
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
        if (!deepEqual($event.filters, this.previous_filters)) {
            this.updateAllSelected();
        }
        this.previous_filters = deepCopy($event.filters);
    }
}

import { TableState } from 'primeng/components/common/tablestate';

import { Component, Output, EventEmitter, Input, OnInit, ViewEncapsulation } from '@angular/core';
import { isNullOrUndefined } from 'util';
import { FilterMetadata } from 'primeng/components/common/filtermetadata';
import * as deepEqual from 'fast-deep-equal';
import { deepCopy, isSubset, arrayUnion, arraySubtract } from '../utils/utils';

export interface AccessionRow {
    id?: string;
    name?: string;
}

interface FilterSet {
    [s: string]: FilterMetadata;
}

interface SortSettings {
    sortField: string;
    sortOrder: number;
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

    previous_filters: FilterSet = {};
    previous_sort_settings: SortSettings = {
        sortField: undefined, sortOrder: 1
    };

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

    filterAccessions(accessions: AccessionRow[],
                     filters: FilterSet): AccessionRow[] {
        let filtered_accessions = accessions;
        for (const filter_field of Object.keys(filters)) {
            const contains = filters[filter_field].value.toUpperCase();
            filtered_accessions = filtered_accessions.filter(acc => {
                return acc[filter_field].toUpperCase().includes(contains);
            });
        }
        return filtered_accessions;
    }

    /**
     * Sorts accession row array in place according to the provided settings.
     */
    sortAccessions(accessions: AccessionRow[],
                   sort_settings: SortSettings): void {
        if (!isNullOrUndefined(sort_settings.sortField)) {
            if (sort_settings.sortField === 'selected') {
                const selected: AccessionRow[] = [];
                const unselected: AccessionRow[] = [];
                accessions.forEach((acc) => {
                    if (this.selectedAccessions.includes(acc.id)) {
                        selected.push(acc);
                    } else {
                        unselected.push(acc);
                    }
                });
                Object.assign(accessions, [...selected, ...unselected]);
            } else {
                accessions.sort((a, b) =>
                    a[sort_settings.sortField].localeCompare(
                        b[sort_settings.sortField]
                    )
                );
            }
            if (sort_settings.sortOrder === -1) {
                accessions.reverse();
            }
        }
    }

    loadDataOnScroll($event: TableState) {
        if (!deepEqual($event.filters, this.previous_filters)) {
            this.updateAllSelected();
            this.filtered_accessions = this.filterAccessions(this.accession_options,
                                                             $event.filters);
            this.previous_filters = deepCopy($event.filters);
        }

        const sort_settings: SortSettings = {
            sortField: $event.sortField,
            sortOrder: $event.sortOrder
        };
        if (!deepEqual(sort_settings, this.previous_sort_settings)) {
            this.sortAccessions(this.filtered_accessions, sort_settings);
            this.previous_sort_settings = deepCopy(sort_settings);
        }

        this.virtual_accession_rows = this.filtered_accessions
                                          .slice($event.first,
                                                 $event.first + $event.rows);
    }
}

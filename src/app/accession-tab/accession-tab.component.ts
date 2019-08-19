import { TableState } from 'primeng/components/common/tablestate';

import { Component, Output, EventEmitter, Input, OnInit, ViewEncapsulation, ViewChild } from '@angular/core';
import { isNullOrUndefined } from 'util';
import { FilterMetadata } from 'primeng/components/common/filtermetadata';
import * as deepEqual from 'fast-deep-equal';
import { deepCopy, isSubset, arrayUnion, arraySubtract } from '../utils/utils';
import { Table } from 'primeng/table';
import { AccessionDictionary, AccessionGroup } from '../introgression-browser/browser-settings';

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
    @ViewChild('dt', { static: true }) dt: Table;

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
    @Output() selectedAccessionsChange = new EventEmitter<string[]>();

    @Input()
    accessionOptions: AccessionRow[];

    @Input()
    accessionDictionary: AccessionDictionary;

    _accessionGroups: AccessionGroup[];
    @Input()
    set accessionGroups(groups: AccessionGroup[]) {
        if (groups !== this._accessionGroups) {
            this._accessionGroups = groups;
            this.categories = this.extractCategories(groups);
            this.accessionGroupsChange.emit(this._accessionGroups);
        }
    }
    get accessionGroups(): AccessionGroup[] {
        return this._accessionGroups;
    }
    @Output()
    accessionGroupsChange = new EventEmitter<AccessionGroup[]>();

    display_add_group_dialog = false;

    filtered_accessions: AccessionRow[];
    virtual_accession_rows: AccessionRow[];

    cols: any[];

    all_selected: boolean;

    previous_filters: FilterSet = {};
    previous_sort_settings: SortSettings = {
        sortField: undefined, sortOrder: 1
    };

    categories: string[] = [];

    _selected_groups: AccessionGroup[] = [];
    set selected_groups(groups: AccessionGroup[]) {
        this.dt.filter(groups, '__groups', 'groups_union');
        this._selected_groups = groups;
    }
    get selected_groups(): AccessionGroup[] {
        return this._selected_groups;
    }

    constructor() { }

    ngOnInit() {
        this.filtered_accessions = this.accessionOptions;
        this.virtual_accession_rows = this.filtered_accessions.slice(0, 100);
        this.cols = [
            { field: 'name', header: 'Name' }
        ];
        this.all_selected = this.accessionOptions.length
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
               !== this.accessionOptions.length;
    }

    filterAccessions(accessions: AccessionRow[],
                     filters: FilterSet): AccessionRow[] {
        let filtered_accessions = accessions;
        for (const filter_field of Object.keys(filters)) {
            if (filter_field === '__groups') {
                // Ignore group filters
                continue;
            }
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
        let acc_options = this.accessionOptions;
        if (!isNullOrUndefined($event.filters['__groups'])
            && $event.filters['__groups'].value.length) {
            const acc = $event.filters['__groups']
                              .value.reduce((acc_ids: string[],
                                             g: AccessionGroup) => {
                return arrayUnion(acc_ids, g.accessions);
            }, []);
            acc_options = acc.map((acc_id: string) => ({
                id: acc_id,
                name: this.accessionDictionary[acc_id]
            }));
        }

        if (!deepEqual($event.filters, this.previous_filters)) {
            this.updateAllSelected();
            this.filtered_accessions = this.filterAccessions(acc_options,
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

    showAddGroupDialog() {
        if (this.selectedAccessions.length !== 0) {
            this.display_add_group_dialog = true;
        }
    }

    addGroup($event: AccessionGroup) {
        this.accessionGroups = [...this.accessionGroups, $event];
    }

    /**
     * Extract category names from array of accession groups.
     */
    extractCategories(groups: AccessionGroup[]): string[] {
        return Array.from(new Set(groups.map(grp => grp.category))).sort();
    }
}

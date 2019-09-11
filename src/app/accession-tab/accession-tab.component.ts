import { TableState } from 'primeng/components/common/tablestate';

import {
    Component, Output, EventEmitter, Input, ViewEncapsulation, ViewChild,
    ViewContainerRef, ComponentFactoryResolver, AfterViewInit
} from '@angular/core';
import { isNullOrUndefined } from 'util';
import { FilterMetadata } from 'primeng/components/common/filtermetadata';
import * as deepEqual from 'fast-deep-equal';
import { deepCopy, isSubset, arrayUnion, arraySubtract, uniqueArray } from '../utils/utils';
import { Table } from 'primeng/table';
import { AccessionGroup, AccessionInfo } from '../introgression-browser/browser-settings';
import { TGRCGeneImporterComponent } from '../tgrc-gene-importer/tgrc-gene-importer.component';
import { AccessionInfoImporterComponent } from './plugins/accession-info-importer.component';

interface FilterSet {
    [s: string]: FilterMetadata;
}

interface SortSettings {
    sortField: string;
    sortOrder: number;
}

interface TableColumn {
    field: string;
    header: string;
    width: number;
}

interface InfoDictionary {
    [key: string]: AccessionInfo;
}

const pluginComponents = {
    'tgrc-importer': TGRCGeneImporterComponent
};

@Component({
    selector: 'app-accession-tab',
    templateUrl: './accession-tab.component.html',
    styleUrls: ['./accession-tab.component.css'],
    encapsulation: ViewEncapsulation.None
})
export class AccessionTabComponent implements AfterViewInit {
    @ViewChild('dt', { static: true })
    private dt: Table;

    @ViewChild('pluginContainer', { read: ViewContainerRef, static: false })
    private pluginContainer: ViewContainerRef;

    readonly sort_icon_width = 30;
    readonly max_column_width = 200;

    private _selectedAccessions: string[];
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

    private _accessionOptions: AccessionInfo[];
    @Input()
    set accessionOptions(acc_infos: AccessionInfo[]) {
        this._accessionOptions = acc_infos;
        this.infoDictionary = this.extractOptionDictionary(acc_infos);
        this.filteredAccessions = this.accessionOptions;
        this.virtual_accession_rows = this.filteredAccessions.slice(0, 100);
        this.cols = this.extractColumns(this.accessionOptions);
        this.all_selected = this.accessionOptions.length
                            === this.selectedAccessions.length;
    }
    get accessionOptions(): AccessionInfo[] {
        return this._accessionOptions;
    }

    private _accessionGroups: AccessionGroup[];
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

    @Input()
    importPlugins: string[] = [];

    displayAddGroupDialog = false;

    filteredAccessions: AccessionInfo[];
    virtual_accession_rows: AccessionInfo[];

    cols: TableColumn[];

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

    suggestions: string[];

    private infoDictionary: InfoDictionary;

    constructor(private resolver: ComponentFactoryResolver) {}

    ngAfterViewInit() {
        if (!isNullOrUndefined(this.importPlugins)) {
            // Queued to avoid plugin ExpressionChangedAfterItHasBeenCheckedError
            Promise.resolve().then(() => this.createPlugins());
        }
    }

    createPlugins() {
        this.importPlugins.filter(plugin => plugin in pluginComponents)
                          .forEach(plugin => {
            const factory = this.resolver
                                .resolveComponentFactory<AccessionInfoImporterComponent>(
                                pluginComponents[plugin]
                            );
            const ref = this.pluginContainer.createComponent(factory);
            ref.instance.infos = this.accessionOptions;
            ref.instance.infosChange.subscribe((infos: AccessionInfo[]) => {
                this.accessionOptions = infos;
            });
        });
    }

    extractOptionDictionary(acc_infos: AccessionInfo[]): InfoDictionary {
        const info_dict = {};
        acc_infos.forEach(info => {
            if ('id' in info) {
                info_dict[info.id] = info;
            }
        });
        return info_dict;
    }

    extractColumnOptions(column: string): string[] {
        return uniqueArray(this.filteredAccessions.map(acc => acc[column]));
    }

    extractColumns(infos: AccessionInfo[]): TableColumn[] {
        const canvas = document.createElement('canvas');
        const ctx: CanvasRenderingContext2D = canvas.getContext('2d');
        ctx.font = '12px Arial';

        return Object.keys(infos[0]).filter(col => col !== 'id' )
                                    .map(col => {
            const column_width = Math.max(
                ctx.measureText(col).width + this.sort_icon_width,
                ...infos.map(info => ctx.measureText(info[col]).width)
            );

            return {
                field: col,
                header: col,
                width: column_width > this.max_column_width ? this.max_column_width
                                                            : column_width
            };
        });
    }

    headerCheckboxChange($event: boolean) {
        const filtered_acc_ids = this.filteredAccessions.map(acc => acc.id);
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
        if (!isNullOrUndefined(this.filteredAccessions)) {
            this.all_selected = isSubset(this.filteredAccessions
                                             .map(acc => acc.id),
                                         this.selectedAccessions);
        }
    }

    filtersUsed(): boolean {
        return this.filteredAccessions.length
               !== this.accessionOptions.length;
    }

    filterAccessions(accessions: AccessionInfo[],
                     filters: FilterSet): AccessionInfo[] {
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
    sortAccessions(accessions: AccessionInfo[],
                   sort_settings: SortSettings): void {
        if (!isNullOrUndefined(sort_settings.sortField)) {
            if (sort_settings.sortField === 'selected') {
                const selected: AccessionInfo[] = [];
                const unselected: AccessionInfo[] = [];
                accessions.forEach(acc => {
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
            acc_options = acc.map(
                (acc_id: string) => this.infoDictionary[acc_id]
            );
        }

        if (!deepEqual($event.filters, this.previous_filters)) {
            this.updateAllSelected();
            this.filteredAccessions = this.filterAccessions(acc_options,
                                                             $event.filters);
            this.previous_filters = deepCopy($event.filters);
        }

        const sort_settings: SortSettings = {
            sortField: $event.sortField,
            sortOrder: $event.sortOrder
        };
        if (!deepEqual(sort_settings, this.previous_sort_settings)) {
            this.sortAccessions(this.filteredAccessions, sort_settings);
            this.previous_sort_settings = deepCopy(sort_settings);
        }

        this.virtual_accession_rows = this.filteredAccessions
                                          .slice($event.first,
                                                 $event.first + $event.rows);
    }

    filterField($event: string, column: string) {
        this.dt.filter($event, column, 'contains');
    }

    showAddGroupDialog() {
        if (this.selectedAccessions.length !== 0) {
            this.displayAddGroupDialog = true;
        }
    }

    addGroup($event: AccessionGroup) {
        this.accessionGroups = [...this.accessionGroups, $event];
    }

    /**
     * Extract category names from array of accession groups.
     */
    extractCategories(groups: AccessionGroup[]): string[] {
        return uniqueArray(groups.map(grp => grp.category)).sort();
    }
}

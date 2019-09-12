import {
    AfterViewInit,
    Component,
    ComponentFactoryResolver,
    EventEmitter,
    Input,
    Output,
    ViewChild,
    ViewContainerRef,
    ViewEncapsulation
} from '@angular/core';

import * as deepEqual from 'fast-deep-equal';
import { FilterMetadata } from 'primeng/components/common/filtermetadata';
import { TableState } from 'primeng/components/common/tablestate';
import { Table } from 'primeng/table';

import {
    AccessionGroup,
    AccessionInfo
} from '../introgression-browser/browser-settings';
import {
    TGRCGeneImporterComponent
} from '../tgrc-gene-importer/tgrc-gene-importer.component';
import {
    arraySubtract,
    arrayUnion,
    deepCopy,
    isNullOrUndefined,
    isSubset,
    uniqueArray
} from '../utils/utils';
import {
    AccessionInfoImporterComponent
} from './plugins/accession-info-importer.component';

interface FilterSet {
    [s: string]: FilterMetadata;
}

interface InfoDictionary {
    [key: string]: AccessionInfo;
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
    static readonly MAX_COLUMN_WIDTH = 200;
    static readonly SORT_ICON_WIDTH = 30;

    @ViewChild('dt', { static: true })
    private readonly dt: Table;

    @ViewChild('pluginContainer', { read: ViewContainerRef, static: false })
    private readonly pluginContainer: ViewContainerRef;

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

    @Input()
    set accessionOptions(accInfos: AccessionInfo[]) {
        this._accessionOptions = accInfos;
        this.infoDictionary = this.extractOptionDictionary(accInfos);
        this.filteredAccessions = this.accessionOptions;
        this.virtualAccessionRows = this.filteredAccessions.slice(0, 100);
        this.cols = this.extractColumns(this.accessionOptions);
        this.updateAllSelected();
    }
    get accessionOptions(): AccessionInfo[] {
        return this._accessionOptions;
    }

    @Input()
    importPlugins: string[] = [];

    @Input()
    set selectedAccessions(accessions: string[]) {
        this._selectedAccessions = accessions;
        this.updateAllSelected();
        this.selectedAccessionsChange.emit(this._selectedAccessions);
    }
    get selectedAccessions(): string[] {
        return this._selectedAccessions;
    }

    @Output()
    accessionGroupsChange = new EventEmitter<AccessionGroup[]>();

    @Output() selectedAccessionsChange = new EventEmitter<string[]>();

    allSelected: boolean;
    categories: string[] = [];
    cols: TableColumn[];
    displayAddGroupDialog = false;
    filteredAccessions: AccessionInfo[];
    suggestions: string[];
    virtualAccessionRows: AccessionInfo[];

    private _accessionGroups: AccessionGroup[];
    private _accessionOptions: AccessionInfo[];
    private _selectedAccessions: string[];
    private _selectedGroups: AccessionGroup[] = [];

    private infoDictionary: InfoDictionary;
    private previousFilters: FilterSet = {};
    private previousSortSettings: SortSettings = {
        sortField: undefined,
        sortOrder: 1
    };

    constructor(private readonly resolver: ComponentFactoryResolver) {}

    set selectedGroups(groups: AccessionGroup[]) {
        this.dt.filter(groups, '__groups', 'groups_union');
        this._selectedGroups = groups;
    }
    get selectedGroups(): AccessionGroup[] {
        return this._selectedGroups;
    }

    ngAfterViewInit() {
        if (!isNullOrUndefined(this.importPlugins)) {
            // Queued to avoid plugin ExpressionChangedAfterItHasBeenCheckedError
            Promise.resolve().then(() => this.createPlugins());
        }
    }

    addGroup($event: AccessionGroup) {
        this.accessionGroups = [...this.accessionGroups, $event];
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

    /**
     * Extract category names from array of accession groups.
     */
    extractCategories(groups: AccessionGroup[]): string[] {
        return uniqueArray(groups.map(grp => grp.category)).sort();
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
            const columnWidth = Math.max(
                ctx.measureText(col).width
                + AccessionTabComponent.SORT_ICON_WIDTH,
                ...infos.map(info => ctx.measureText(info[col]).width)
            );

            return {
                field: col,
                header: col,
                width: columnWidth > AccessionTabComponent.MAX_COLUMN_WIDTH
                                     ? AccessionTabComponent.MAX_COLUMN_WIDTH
                                     : columnWidth
            };
        });
    }

    extractOptionDictionary(accInfos: AccessionInfo[]): InfoDictionary {
        const infoDict = {};
        accInfos.forEach(info => {
            if ('id' in info) {
                infoDict[info.id] = info;
            }
        });
        return infoDict;
    }

    filterAccessions(accessions: AccessionInfo[],
                     filters: FilterSet): AccessionInfo[] {
        let filteredAccessions = accessions;
        for (const filterField of Object.keys(filters)) {
            if (filterField === '__groups') {
                // Ignore group filters
                continue;
            }
            const contains = filters[filterField].value.toUpperCase();
            filteredAccessions = filteredAccessions.filter(acc => {
                return acc[filterField].toUpperCase().includes(contains);
            });
        }
        return filteredAccessions;
    }

    filterField($event: string, column: string) {
        this.dt.filter($event, column, 'contains');
    }

    filtersUsed(): boolean {
        return this.filteredAccessions.length
               !== this.accessionOptions.length;
    }

    headerCheckboxChange($event: boolean) {
        const filteredAccIds = this.filteredAccessions.map(acc => acc.id);
        if ($event) {
            // Checking all matching accessions
            this.selectedAccessions = arrayUnion(this.selectedAccessions,
                                                 filteredAccIds);
        } else {
            // Unchecking all matching accessions
            this.selectedAccessions = arraySubtract(this.selectedAccessions,
                                                    filteredAccIds);
        }
    }

    loadDataOnScroll($event: TableState) {
        let accOptions = this.accessionOptions;
        if (!isNullOrUndefined($event.filters['__groups'])
            && $event.filters['__groups'].value.length) {
            const acc = $event.filters['__groups']
                              .value.reduce((accIds: string[],
                                             g: AccessionGroup) => {
                return arrayUnion(accIds, g.accessions);
            }, []);
            accOptions = acc.map(
                (accId: string) => this.infoDictionary[accId]
            );
        }

        if (!deepEqual($event.filters, this.previousFilters)) {
            this.updateAllSelected();
            this.filteredAccessions = this.filterAccessions(accOptions,
                                                             $event.filters);
            this.previousFilters = deepCopy($event.filters);
        }

        const sortSettings: SortSettings = {
            sortField: $event.sortField,
            sortOrder: $event.sortOrder
        };
        if (!deepEqual(sortSettings, this.previousSortSettings)) {
            this.sortAccessions(this.filteredAccessions, sortSettings);
            this.previousSortSettings = deepCopy(sortSettings);
        }

        this.virtualAccessionRows = this.filteredAccessions
                                          .slice($event.first,
                                                 $event.first + $event.rows);
    }

    showAddGroupDialog() {
        if (this.selectedAccessions.length !== 0) {
            this.displayAddGroupDialog = true;
        }
    }

    /**
     * Sorts accession row array in place according to the provided settings.
     */
    sortAccessions(accessions: AccessionInfo[],
                   sortSettings: SortSettings): void {
        if (!isNullOrUndefined(sortSettings.sortField)) {
            if (sortSettings.sortField === 'selected') {
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
                    a[sortSettings.sortField].localeCompare(
                        b[sortSettings.sortField]
                    )
                );
            }
            if (sortSettings.sortOrder === -1) {
                accessions.reverse();
            }
        }
    }

    updateAllSelected() {
        if (!isNullOrUndefined(this.filteredAccessions)
            && !isNullOrUndefined(this.selectedAccessions)) {
            this.allSelected = isSubset(this.filteredAccessions
                                             .map(acc => acc.id),
                                        this.selectedAccessions);
        }
    }
}

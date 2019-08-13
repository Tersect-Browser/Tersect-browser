import { PlotStateService } from '../introgression-plot/services/plot-state.service';

import { Component, Output, EventEmitter, Input, OnInit, ViewEncapsulation } from '@angular/core';
import { IntrogressionPlotService } from '../introgression-plot/services/introgression-plot.service';
import { isNullOrUndefined } from 'util';

export interface AccessionRow {
    id?: string;
    name?: string;
}

@Component({
    selector: 'app-accession-tab',
    templateUrl: './accession-tab.component.html',
    styleUrls: ['./accession-tab.component.css'],
    providers: [IntrogressionPlotService],
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

    cols: any[];

    virtual_accession_rows: AccessionRow[];

    all_selected: boolean;

    constructor(private plotState: PlotStateService) { }

    ngOnInit() {
        this.virtual_accession_rows = this.accession_options.slice(0, 100);
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

    loadDataOnScroll($event) {
        this.virtual_accession_rows = this.accession_options
                                          .slice($event.first,
                                                 $event.first + $event.rows);
    }
}

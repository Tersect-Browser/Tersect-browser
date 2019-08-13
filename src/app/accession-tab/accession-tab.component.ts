import { PlotStateService } from '../introgression-plot/services/plot-state.service';

import { Component, Output, EventEmitter, Input, OnInit, ViewEncapsulation } from '@angular/core';
import { IntrogressionPlotService } from '../introgression-plot/services/introgression-plot.service';
import { isNullOrUndefined } from 'util';

interface AccessionRow {
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
        if (!isNullOrUndefined(this.accession_rows)) {
            this.all_selected = this.accession_rows.length
                                === this.selectedAccessions.length;
        }
    }
    get selectedAccessions(): string[] {
        return this._selectedAccessions;
    }

    cols: any[];

    accession_rows: AccessionRow[];
    virtual_accession_rows: AccessionRow[];

    all_selected: boolean;

    constructor(private plotState: PlotStateService,
                private plotService: IntrogressionPlotService) { }

    formatRow = (accession_id: string) => ({
        id: accession_id,
        name: this.plotService.getAccessionLabel(accession_id)
    })

    ngOnInit() {
        this.accession_rows = this.plotState.accessions.map(this.formatRow);
        this.virtual_accession_rows = this.accession_rows.slice(0, 100);
        this.cols = [
            { field: 'id', header: 'ID' },
            { field: 'name', header: 'Name' }
        ];
        this.all_selected = this.accession_rows.length
                            === this.selectedAccessions.length;
    }

    headerCheckboxChange($event: boolean) {
        if ($event) {
            this.selectedAccessions = [...this.plotState.accessions];
        } else {
            this.selectedAccessions = [];
        }
    }

    loadDataOnScroll($event) {
        this.virtual_accession_rows = this.accession_rows.slice($event.first,
                                                                $event.first
                                                                + $event.rows);
    }
}

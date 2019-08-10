import { PlotStateService } from '../introgression-plot/services/plot-state.service';

import { Component, Output, EventEmitter, Input, OnInit, ViewEncapsulation } from '@angular/core';

interface AccessionRow {
    id?: string;
}

@Component({
    selector: 'app-accession-tab',
    templateUrl: './accession-tab.component.html',
    styleUrls: ['./accession-tab.component.css'],
    encapsulation: ViewEncapsulation.None
})
export class AccessionTabComponent implements OnInit {
    @Output() updateAccessions = new EventEmitter<string[]>();

    @Input()
    selectedAccessions: string[];

    cols: any[];

    accession_rows: AccessionRow[];
    accession_count: number;
    virtual_accession_rows: AccessionRow[];

    constructor(private plotState: PlotStateService) {}

    ngOnInit() {
        this.accession_rows = this.plotState.accessions.map((acc_id) => {
            return {
                id: acc_id
            };
        });
        this.accession_count = this.accession_rows.length;
        this.virtual_accession_rows = this.accession_rows.slice(0, 100);
        this.cols = [
            { field: 'id', header: 'ID' }
        ];
    }

    loadDataOnScroll($event) {
        console.log($event);
        this.virtual_accession_rows = this.accession_rows.slice($event.first,
                                                                $event.first
                                                                + $event.rows);
    }
}

import { PlotStateService } from '../introgression-plot/services/plot-state.service';

import { Component, Output, EventEmitter, Input } from '@angular/core';

interface AccessionRow {
    id?: string;
};

@Component({
    selector: 'app-accession-tab',
    templateUrl: './accession-tab.component.html',
    styleUrls: ['./accession-tab.component.css']
})
export class AccessionTabComponent {
    @Output() updateAccessions = new EventEmitter<string[]>();

    @Input()
    selectedAccessions: string[];

    cols: any[];

    accessions_rows: AccessionRow[];

    constructor(private plotState: PlotStateService) {}

    ngOnInit() {
        this.accessions_rows = this.plotState.accessions.map((acc_id) => {
            return {
                id: acc_id
            };
        })
        this.cols = [
            { field: 'id', header: 'ID' }
        ];
    }
}

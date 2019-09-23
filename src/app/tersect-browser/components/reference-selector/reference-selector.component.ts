import { Component, OnDestroy, OnInit } from '@angular/core';

import { SelectItem } from 'primeng/components/common/selectitem';
import { Subscription } from 'rxjs';

import {
    PlotStateService
} from '../../../tersect-distance-plot/services/plot-state.service';
import {
    isNullOrUndefined
} from '../../../utils/utils';

@Component({
    selector: 'app-reference-selector',
    templateUrl: './reference-selector.component.html'
})
export class ReferenceSelectorComponent implements OnInit, OnDestroy {
    accessionOptions: SelectItem[];

    private infoUpdate: Subscription;

    constructor(private readonly plotState: PlotStateService) { }

    set referenceAccession(accession: string) {
        if (!isNullOrUndefined(accession)) {
            this.plotState.reference = accession;
        }
    }
    get referenceAccession(): string {
        return this.plotState.reference;
    }

    ngOnInit() {
        this.infoUpdate = this.plotState.accessionInfos$.subscribe(infos => {
            if (!isNullOrUndefined(infos)) {
                this.accessionOptions = infos.map(info => ({
                    label: info.Label,
                    value: info.id
                }));
            }
        });
    }

    ngOnDestroy() {
        this.infoUpdate.unsubscribe();
    }
}

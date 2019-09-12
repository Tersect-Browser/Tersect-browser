import { Component, OnInit, OnDestroy } from '@angular/core';
import { SelectItem } from 'primeng/components/common/selectitem';
import { PlotStateService } from '../../introgression-plot/services/plot-state.service';
import { Subscription } from 'rxjs';
import { isNullOrUndefined } from '../../utils/utils';

@Component({
    selector: 'app-reference-selector',
    templateUrl: './reference-selector.component.html'
})
export class ReferenceSelectorComponent implements OnInit, OnDestroy {
    accessionOptions: SelectItem[];

    set referenceAccession(accession: string) {
        if (!isNullOrUndefined(accession)) {
            this.plotState.reference = accession;
        }
    }
    get referenceAccession(): string {
        return this.plotState.reference;
    }

    private infoUpdate: Subscription;

    constructor(private readonly plotState: PlotStateService) { }

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

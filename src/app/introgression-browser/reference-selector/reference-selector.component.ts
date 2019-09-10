import { Component, EventEmitter, Input, Output } from '@angular/core';
import { SelectItem } from 'primeng/components/common/selectitem';
import { AccessionInfo } from '../browser-settings';
import { isNullOrUndefined } from 'util';

@Component({
    selector: 'app-reference-selector',
    templateUrl: './reference-selector.component.html'
})
export class ReferenceSelectorComponent {
    accessionOptions: SelectItem[];

    _referenceAccession: string;

    @Input()
    set referenceAccession(accession: string) {
        if (isNullOrUndefined(accession)) {
            this._referenceAccession = accession;
            this.referenceAccessionChange.emit(accession);
        }
    }

    get referenceAccession(): string {
        return this._referenceAccession;
    }

    @Output()
    referenceAccessionChange = new EventEmitter<string>();

    @Input()
    set accessionInfos(infos: AccessionInfo[]) {
        if (isNullOrUndefined(infos)) {
            return;
        }
        this.accessionOptions = infos.map(info => ({
            label: info.Label,
            value: info.id
        }));
    }
}

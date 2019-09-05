import { Output, EventEmitter, Input } from '@angular/core';
import { AccessionInfo } from '../../introgression-browser/browser-settings';

export abstract class AccessionInfoImporterComponent {
    @Input()
    infos: AccessionInfo[];

    @Output()
    infosChange = new EventEmitter<AccessionInfo[]>();
}

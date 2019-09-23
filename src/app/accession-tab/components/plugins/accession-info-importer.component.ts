import { EventEmitter, Input, Output } from '@angular/core';

import { AccessionInfo } from '../../../pages/tersect-browser/browser-settings';

export abstract class AccessionInfoImporterComponent {
    @Input()
    infos: AccessionInfo[];

    @Output()
    infosChange = new EventEmitter<AccessionInfo[]>();
}

import { EventEmitter, Input, Output } from '@angular/core';

import { AccessionInfo } from '../../../tersect-distance-plot/models/PlotState';

export abstract class AccessionInfoImporterComponent {
    @Input()
    infos: AccessionInfo[];

    @Output()
    infosChange = new EventEmitter<AccessionInfo[]>();
}

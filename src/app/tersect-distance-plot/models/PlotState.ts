import {
    Observable
} from 'rxjs';

import {
    Chromosome
} from '../../models/Chromosome';
import {
    PlotPosition
} from '../../models/Plot';
import {
    AccessionDictionary,
    AccessionDisplayStyle,
    AccessionGroup,
    AccessionInfo
} from '../../tersect-browser/browser-settings';

export interface PlotState {
    accessionStyle$: Observable<AccessionDisplayStyle>;
    zoomLevel$: Observable<number>;
    accessionDictionary$: Observable<AccessionDictionary>;
    plotPosition$: Observable<PlotPosition>;

    datasetId: string;
    accessionStyle: AccessionDisplayStyle;
    accessionInfos: AccessionInfo[];
    accessionDictionary: AccessionDictionary;
    accessionGroups: AccessionGroup[];
    accessions: string[];
    reference: string;
    chromosome: Chromosome;
    interval: number[];
    binsize: number;
    zoomLevel: number;
    orderedAccessions: string[];
    plugins: string[];
    plotPosition: PlotPosition;
}

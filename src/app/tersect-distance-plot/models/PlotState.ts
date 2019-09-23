import {
    Observable
} from 'rxjs';

import {
    AccessionDictionary,
    AccessionDisplayStyle,
    AccessionGroup,
    AccessionInfo
} from '../../pages/tersect-browser/browser-settings';
import {
    Chromosome
} from '../../shared/models/Chromosome';
import {
    PlotPosition
} from '../../shared/models/Plot';

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

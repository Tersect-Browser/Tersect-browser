import {
    Observable
} from 'rxjs';

import {
    Chromosome
} from '../../../models/Chromosome';
import {
    PlotPosition
} from '../../../models/Plot';
import {
    isNullOrUndefined
} from '../../../utils/utils';

export type AccessionDisplayStyle = 'labels' | 'tree_simple' | 'tree_linear';

export interface AccessionDictionary {
    [accessionId: string]: {
        label?: string;
        colors?: string[];
    };
}

export interface AccessionGroup {
    name: string;
    category?: string;
    color?: string;
    accessions: string[];
}

export interface AccessionInfo {
    id: string;
    Label: string;
    [s: string]: string;
}

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

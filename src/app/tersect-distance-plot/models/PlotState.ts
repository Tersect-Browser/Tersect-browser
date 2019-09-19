import {
    AccessionDisplayStyle,
    AccessionInfo,
    AccessionDictionary,
    AccessionGroup
} from '../../tersect-browser/browser-settings';

export interface PlotState {
    datasetId: string;
    accessionStyle: AccessionDisplayStyle;
    accessionInfos: AccessionInfo[];
    accessionDictionary: AccessionDictionary;
    accessionGroups: AccessionGroup[];
    accessions: string[];
    reference: string;
    chromosome: Chromosome;
    interval(): number[];
    binsize(): number;
    zoomLevel(): number;
    orderedAccessions(): string[];
    plugins: string[];
    plotPosition:
}

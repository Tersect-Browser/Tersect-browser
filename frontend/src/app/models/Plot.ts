export interface PlotArea {
    plotAreaType: 'background' | 'position' | 'accession' | 'interval' | 'bin';
}

export interface PlotAccession extends PlotArea {
    accessionLabel: string;
    accession: string;
    startPosition?: number;
    endPosition?: number;
}

export interface PlotSequenceInterval extends PlotArea {
    startPosition: number;
    endPosition: number;
}

export interface PlotSequencePosition extends PlotArea {
    position: number;
}

export type PlotBin = PlotAccession & PlotSequenceInterval;

export interface PlotMouseClickEvent {
    x: number;
    y: number;
    target: PlotArea;
}

export interface PlotMouseHoverEvent {
    x: number;
    y: number;
    target: PlotArea;
}

export interface PlotMouseMoveEvent {
    element: string;
    buttons?: number;
}

export interface PlotPosition {
    x: number;
    y: number;
}

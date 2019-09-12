export interface PlotArea {
    type: string;
}

export interface PlotAccession extends PlotArea {
    accessionLabel: string;
    accession: string;
}

export interface PlotBin extends PlotArea {
    accessionLabel: string;
    accession: string;
    startPosition: number;
    endPosition: number;
}

export interface PlotSequenceInterval extends PlotArea {
    startPosition: number;
    endPosition: number;
}

export interface PlotSequencePosition extends PlotArea {
    position: number;
}

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

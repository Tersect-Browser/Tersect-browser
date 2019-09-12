export interface PlotArea {
    type: string;
}

export interface PlotAccession extends PlotArea {
    accession_label: string;
    accession: string;
}

export interface PlotBin extends PlotArea {
    accession_label: string;
    accession: string;
    start_position: number;
    end_position: number;
}

export interface PlotSequenceInterval extends PlotArea {
    start_position: number;
    end_position: number;
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

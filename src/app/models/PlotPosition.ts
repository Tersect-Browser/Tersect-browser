export interface PlotPosition {
    x: number;
    y: number;
}

export interface PlotArea {
    type: string;
}

export interface PlotBin extends PlotArea {
    accession: string;
    start_position: number;
    end_position: number;
}

export interface PlotAccession extends PlotArea {
    accession: string;
}

export interface PlotChromosomePosition extends PlotArea {
    position: number;
}

export interface PlotClickEvent {
    x: number;
    y: number;
    target: PlotArea;
}

export interface PlotHoverEvent {
    x: number;
    y: number;
    target: PlotArea;
}

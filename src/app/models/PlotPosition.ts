export interface PlotPosition {
    x: number;
    y: number;
}

export interface PlotArea {
    type: string;
}

export interface PlotBin extends PlotArea {
    type: 'bin';
    accession: string;
    start_position: number;
    end_position: number;
}

export interface PlotAccession extends PlotArea {
    type: 'accession';
    accession: string;
}

export interface PlotBackground extends PlotArea {
    type: 'background';
}

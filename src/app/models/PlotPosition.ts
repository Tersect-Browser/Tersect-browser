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

export interface PlotSelectionEvent {
     x: number;
     y: number;
     type: 'bin' | 'accession';
     selection: PlotBin | PlotAccession[];
}

export interface PlotPosition {
    x: number;
    y: number;
}

export interface PlotBin {
    type: 'bin';
    accession: string;
    start_position: number;
    end_position: number;
}

export interface PlotAccession {
    type: 'accession';
    accession: string;
}

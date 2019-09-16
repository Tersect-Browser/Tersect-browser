export interface DistanceBins {
    reference: string;
    region: string;
    bins: { [accId: string]: number[] };
}

export interface DistanceBinQuery {
    reference: string;
    chromosome_name: string;
    interval: number[];
    binsize: number;
    accessions: string[];
}

export interface RefDistQuery {
    reference: string;
    chromosome_name: string;
    interval: number[];
    binsize: number;
    accessions: string[];
}

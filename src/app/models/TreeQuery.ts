export interface TreeQuery {
    chromosomeName: string;
    interval: number[];
    accessions: string[];
}

/**
 * Required for a nested MongoDB query.
 */
export interface TreeDatabaseQuery {
    datasetId: string;
    'query.chromosomeName': string;
    'query.interval': number[];
    'query.accessions': string[];
}

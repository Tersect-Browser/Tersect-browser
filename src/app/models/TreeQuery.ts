export interface TreeQuery {
    chromosome_name: string;
    interval: number[];
    accessions: string[];
}

/**
 * Required for a nested MongoDB query.
 */
export interface TreeDatabaseQuery {
    dataset_id: string;
    'query.chromosome_name': string;
    'query.interval': number[];
    'query.accessions': string[];
}

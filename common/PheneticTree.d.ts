export type TreeNode = {
    taxon?: { name: string, genotype?: string },
    length?: number,
    children: TreeNode[]
};

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

export interface PheneticTree {
    query: TreeQuery;
    root: TreeNode;
}

/**
 * Used for accessing phylogenetic trees
 */

import { Schema, model } from 'mongoose';
import { TreeQuery } from '../../app/models/TreeQuery';
import { TreeNode } from '../../app/clustering/clustering';

export interface IPhyloTree {
    dataset_id: string;
    query: TreeQuery;
    tree: TreeNode;
}

const PhyloTreeSchema = new Schema({
    dataset_id: String,
    // Matches the TreeQuery interface
    query: {
        chromosome_name: String,
        interval: [Number],
        accessions: [String]
    },
    // TODO: match with TreeNode interface
    tree: Schema.Types.Mixed
});

export const PhyloTree = model('PhyloTree', PhyloTreeSchema, 'trees');

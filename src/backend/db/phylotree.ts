/**
 * Used for accessing phylogenetic trees
 */

import { Schema, model, Document } from 'mongoose';
import { TreeQuery } from '../../app/models/TreeQuery';

export interface IPhyloTree extends Document {
    dataset_id: string;
    query: TreeQuery;
    status: string;
    tree_newick?: string;
}

const PhyloTreeSchema = new Schema({
    dataset_id: String,
    // Matches the TreeQuery interface
    query: {
        chromosome_name: String,
        interval: [Number],
        accessions: [String]
    },
    status: String,
    // TODO: match with TreeNode interface
    tree_newick: String
});

export const PhyloTree = model<IPhyloTree>('PhyloTree',
                                           PhyloTreeSchema,
                                           'trees');

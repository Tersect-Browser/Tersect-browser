/**
 * Used for accessing phenetic trees
 */

import { Document, model, Schema } from 'mongoose';

import { TreeQuery } from '../../app/models/TreeQuery';

export interface PheneticTree extends Document {
    dataset_id: string;
    query: TreeQuery;
    status: string;
    tree_newick?: string;
}

const PheneticTreeSchema = new Schema({
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

export const PheneticTree = model<PheneticTree>('PheneticTree',
                                                 PheneticTreeSchema,
                                                 'trees');

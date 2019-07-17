/**
 * Used for accessing phylogenetic trees
 */

import { Schema, model } from 'mongoose';

const PhyloTreeSchema = new Schema({
    // Matches the TreeQuery interface
    query: {
        dataset_id: String,
        chromosome_name: String,
        interval: [Number],
        accessions: [String]
    },
    // Matches the TreeNode interface
    tree: {
        taxon: {
            name: String,
            genotype: String
        },
        length: Number,
        children: [{
            type: Schema.Types.ObjectId,
            ref: 'PhyloTree'
        }]
    }
});

export const PhyloTree = model('PhyloTree', PhyloTreeSchema, 'trees');

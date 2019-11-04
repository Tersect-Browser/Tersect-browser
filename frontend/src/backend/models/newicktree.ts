/**
 * Used for accessing phenetic trees
 */

import { Document, model, Schema } from 'mongoose';

import { TreeQuery } from '../../app/models/PheneticTree';

export interface NewickTree extends Document {
    datasetId: string;
    query: TreeQuery;
    status: string;
    tree?: string;
}

const NewickTreeSchema = new Schema({
    datasetId: String,
    // Matches the TreeQuery interface
    query: {
        chromosomeName: String,
        interval: [Number],
        accessions: [String]
    },
    status: String,
    tree: String
});

export const NewickTree = model<NewickTree>('NewickTree',
                                            NewickTreeSchema,
                                            'trees');

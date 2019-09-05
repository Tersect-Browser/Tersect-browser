import { Schema, model, Document } from 'mongoose';

export interface GeneTGRC extends Document {
    gene: string;
    locusName: string;
    locus: string;
    chromosome: string;
    arm: string;
}

const GeneTGRCSchema = new Schema({
    gene: String,
    locusName: String,
    locus: String,
    chromosome: String,
    arm: String
});

export const GeneTGRC = model<GeneTGRC>('GeneTGRC',
                                        GeneTGRCSchema,
                                        'genesTGRC');

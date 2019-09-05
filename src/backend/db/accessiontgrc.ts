import { Schema, model, Document } from 'mongoose';

export interface AccessionTGRC extends Document {
    accession: string;
    alleles: { gene: string; allele: string; }[];
}

const AccessionTGRCSchema = new Schema({
    lAccN: {
        type: String,
        alias: 'accession'
    },
    lgene: {
        type: [ { geme: String, allele: String } ],
        alias: 'alleles'
    }
});
AccessionTGRCSchema.set('toObject', { getters: true, virtuals: true });

export const AccessionTGRC = model<AccessionTGRC>('AccessionTGRC',
                                                  AccessionTGRCSchema,
                                                  'accTGRC');

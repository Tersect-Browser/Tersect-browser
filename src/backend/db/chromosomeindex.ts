/**
 * Used for accessing chromosome data (particularly gap index information).
 */

import { model, Schema } from 'mongoose';

const ChromosomeSchema = new Schema({
    reference: String,
    name: String,
    length: Number,
    gaps: [ { start: Number, end: Number, size: Number } ]
});

export const ChromosomeIndex = model('chromosomes', ChromosomeSchema,
                                     'chromosomes');

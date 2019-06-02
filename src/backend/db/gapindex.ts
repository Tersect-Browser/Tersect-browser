/**
 * Used for accessing per-chromosome indices of gaps.
 */

import { Schema, model } from 'mongoose';

const GapIndexSchema = new Schema({
    chromosome: String,
    gaps: [ { start: Number, end: Number, size: Number } ]
});

export const GapIndex = model('gaps', GapIndexSchema, 'gaps');

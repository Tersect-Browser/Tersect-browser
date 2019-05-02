/**
 * Used for accessing stored distance matrices
 */

import { Schema, model } from 'mongoose';

const MatrixSchema = new Schema({
    region: String,
    samples: [String],
    matrix: [[Number]]
});

export const DBMatrix = model('matrices', MatrixSchema,
                              'matrices');

/**
 * Used for accessing stored distance matrices
 */

import { Schema, model } from 'mongoose';

const MatrixSchema = new Schema({
    command: String,
    tersect_output: Schema.Types.Mixed
});

export const DBMatrix = model('matrices', MatrixSchema,
                              'matrices');

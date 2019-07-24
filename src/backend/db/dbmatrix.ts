/**
 * Used for accessing stored distance matrices
 */

import { Schema, model } from 'mongoose';

const MatrixSchema = new Schema({
    dataset_id: String,
    matrix_file: String,
    region: String
});

export const DBMatrix = model('matrices', MatrixSchema,
                              'matrices');

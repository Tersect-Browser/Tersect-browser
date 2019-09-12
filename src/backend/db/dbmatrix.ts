/**
 * Used for accessing stored distance matrices
 */

import { model, Schema } from 'mongoose';

const MatrixSchema = new Schema({
    dataset_id: String,
    matrix_file: String,
    region: String
});

export const DBMatrix = model('matrices', MatrixSchema,
                              'matrices');

/**
 * Used for accessing Tersect Browser datasets.
 */

import { Schema, model } from 'mongoose';

const DatasetSchema = new Schema({
    dataset: String,
    tsi_location: String,
    reference: String
});

export interface IDataset {
    dataset: string;
    tsi_location: string;
    reference: string;
}

export const Dataset = model('datasets', DatasetSchema, 'datasets');

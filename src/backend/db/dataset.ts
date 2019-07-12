/**
 * Used for accessing Tersect Browser datasets.
 */

import { Schema, model } from 'mongoose';

const DatasetSchema = new Schema({
    _id: String,
    view_id: String,
    tsi_location: String,
    reference: String
});

export interface IDataset {
    _id: string;
    view_id: string;
    tsi_location: string;
    reference: string;
}

export const Dataset = model('datasets', DatasetSchema, 'datasets');

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

export interface Dataset {
    _id: string;
    view_id: string;
    tsi_location: string;
    reference: string;
}

/**
 * Publicly visible information on a dataset.
 */
export interface DatasetPublic {
    dataset_id: string;
    view_id: string;
    reference: string;
}

export const Dataset = model('datasets', DatasetSchema, 'datasets');

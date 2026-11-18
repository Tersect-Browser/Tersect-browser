/**
 * Used for accessing Tersect Browser datasets.
 */

import { model, Schema } from 'mongoose';

const DatasetSchema = new Schema({
    _id: String,
    view_id: String,
    tsi_location: String,
    reference: String,
    description: String,
    // Built from VCF files, with variants in the variant store (ClickHouse)
    variant_search: Boolean,
    // Which variants the Tersect index counts (from the dataset manifest)
    tersect: { homozygous: Boolean, types: String },
    // Shown in the public dataset list (default true). Unlisted datasets
    // still open from share links.
    listed: Boolean
}, { strict: false });

export interface Dataset {
    _id: string;
    view_id: string;
    tsi_location: string;
    reference: string;
    description?: string;
    variant_search?: boolean;
    tersect?: { homozygous: boolean; types: 'snps' | 'indels' | 'both' };
    listed?: boolean;
}

/**
 * Publicly visible information on a dataset.
 */
export interface DatasetPublic {
    dataset_id: string;
    view_id: string;
    reference: string;
    description: string;
    variant_search: boolean;
    accession_count?: number;
}

export const Dataset = model<Dataset>('datasets', DatasetSchema, 'datasets');

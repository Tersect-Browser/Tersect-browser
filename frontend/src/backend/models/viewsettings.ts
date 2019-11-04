/**
 * Used for exported browser views.
 */

import { model, Schema } from 'mongoose';

const ViewSettingsSchema = new Schema({
    _id: String,
    settings: {
        dataset_id: String,
        accession_style: String,
        accession_infos: Schema.Types.Mixed,
        accession_groups: Schema.Types.Mixed,
        selected_accessions: {
            type: [String],
            default: undefined
        },
        selected_reference: String,
        selected_chromosome: {
            type: { name: String, size: Number },
            default: undefined
        },
        selected_interval: {
            type: [Number],
            default: undefined
        },
        selected_binsize: Number,
        zoom_level: Number,
        plugins: [String]
    }
});

export const ViewSettings = model('views', ViewSettingsSchema, 'views');

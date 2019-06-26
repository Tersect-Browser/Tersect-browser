/**
 * Used for exported browser views.
 */

import { Schema, model } from 'mongoose';

const ViewSettingsSchema = new Schema({
    _id: Number,
    settings: {
        selectedAccessionDisplayStyle: String,
        selected_accessions: [String],
        selected_reference: String,
        selected_chromosome: { name: String, size: Number },
        selected_interval: [Number],
        selected_binsize: Number,
        zoom_level: Number
    }
});

export const ViewSettings = model('views', ViewSettingsSchema, 'views');

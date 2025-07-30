// models/SpeciesTreeCache.ts
import { Schema, model } from 'mongoose';

const SpeciesTreeCacheSchema = new Schema({
  datasetId: { type: String, required: true, index: true },
  accessionsKey: { type: String, required: true, index: true }, // hash of accession set
  kind: { type: String, enum: ['astral'], required: true },
  status: { type: String, enum: ['building', 'ready', 'error'], default: 'building', index: true },
  tree: { type: String },       // Newick (ASTRAL output)
  error: { type: String },
  updatedAt: { type: Date, default: Date.now, index: true },
  lockAt: { type: Date, default: Date.now, index: true } // for stale lock protection
}, { versionKey: false });

SpeciesTreeCacheSchema.index({ datasetId: 1, accessionsKey: 1, kind: 1 }, { unique: true });

export default model('SpeciesTreeCache', SpeciesTreeCacheSchema);

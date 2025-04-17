const mongoose = require('mongoose');

const InfoSchema = new mongoose.Schema({
  REF: String,
  ALT: String,
  DP: Number,
  DP4: String,
  MQ: Number,
  FQ: Number,
  AF1: Number,
  CI95: String,
  PV4: String,
  INDEL: Boolean,
  PC2: String,
  PCHI2: Number,
  QCHI2: Number,
  RP: Number,
  EFF: String
}, { _id: false });

const FormatSchema = new mongoose.Schema({
  GT: String,
  GQ: Number,
  GL: String,
  DP: Number,
  SP: Number,
  PL: String
}, { _id: false });

const SampleSchema = new mongoose.Schema({
  SampleName: String,
  Data: mongoose.Schema.Types.Mixed,
  format: FormatSchema
}, { _id: false });

const VariantSchema = new mongoose.Schema({
  CHROM: String,
  POS: Number,
  ID: String,
  QUAL: Number,
  FILTER: String,
  info: InfoSchema,
  samples: [SampleSchema],
  vcf_filename: String,
  accession_name: String,
    gene_name: String,
    impact: String
});

// 🔐 Uniqueness constraint to avoid duplicates per CHROM + POS + accession
VariantSchema.index({ CHROM: 1, POS: 1, accession_name: 1 }, { unique: true });

// 📈 Helpful search indexes
VariantSchema.index({ "samples.SampleName": 1 });
VariantSchema.index({ "info.EFF": "text" });
VariantSchema.index({ accession_name: 1 });
VariantSchema.index({ gene_name: 1 });
VariantSchema.index({ impact: 1 });

export const Variants= mongoose.model('variants', VariantSchema, 'variants');



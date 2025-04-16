const fs = require('fs');
const zlib = require('zlib');
const readline = require('readline');
const mongoose = require('mongoose');
const { Variants } = require('../models/variants');
const tbConfig = require('../../../tbconfig.json');

const mongoUrl = `${tbConfig.mongoHost}/${tbConfig.dbName}`;

mongoose.connect(mongoUrl, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log("✅ MongoDB connected. Data upload has started...");
}).catch(err => {
  console.error("❌ MongoDB connection error:", err.message);
  process.exit(1);
});

const parseVCF = async (filepath, accessionName, vcfName) => {
  try {
    console.log('🧹 Clearing existing variants collection...');
    await Variants.deleteMany({ accession_name: accessionName });
    console.log(`✅ Cleared variants for accession: ${accessionName}`);
  } catch (err) {
    console.error('❌ Failed to clear variants collection:', err.message);
    process.exit(1);
  }

  console.time("⏱️ Total Processing Time");
  console.log(`📄 Starting processing for gzipped file: ${filepath}`);

  if (!fs.existsSync(filepath)) {
    console.error(`❌ Error: File ${filepath} does not exist.`);
    process.exit(1);
  }

  const stream = fs.createReadStream(filepath).pipe(zlib.createGunzip());
  const rl = readline.createInterface({
    input: stream,
    crlfDelay: Infinity
  });

  let headers = [];
  let sampleNames = [];
  let processedCount = 0;
  let skippedCount = 0;

  for await (const line of rl) {
    if (line.startsWith('##')) continue;

    if (line.startsWith('#CHROM')) {
      headers = line.substring(1).split('\t');
      sampleNames = headers.slice(9);
      console.log(`🧬 Detected ${sampleNames.length} samples`);
      continue;
    }

    const cols = line.split('\t');
    if (cols.length < 9) continue;

    const [CHROM, POS_raw, ID, REF, ALT, QUAL_raw, FILTER, INFO, FORMAT, ...sampleData] = cols;

    const POS = parseInt(POS_raw);
    const QUAL = parseFloat(QUAL_raw);
    const infoMap:any = {};

    INFO.split(';').forEach(entry => {
      const [key, value] = entry.split('=');
      infoMap[key] = value || true;
    });

    // ➤ Extract gene name and impact from EFF
    let geneName = null;
    let impact = null;

    if (infoMap.EFF) {
      const effects = infoMap.EFF.split(',');

      for (const eff of effects) {
        const match = eff.match(/^([^(]+)\(([^)]+)\)$/);
        if (!match) continue;

        const [, , inner] = match;
        const fields = inner.split('|');

        if (fields[5]) {
          geneName = fields[5];
          impact = fields[0] || null;
          break;
        }
      }
    }

    // ➤ Skip if no gene is associated
    if (!geneName) {
      skippedCount++;
      continue;
    }

    const formatKeys = FORMAT.split(':');
    const samples = [];

    for (let i = 0; i < sampleData.length; i++) {
      const formatValues = sampleData[i].split(':');
      const formatObj = formatKeys.reduce((acc, key, idx) => {
        acc[key] = formatValues[idx] ?? null;
        return acc;
      }, {});

      samples.push({
        SampleName: sampleNames[i],
        Data: sampleData[i],
        format: {
          GT: formatObj.GT || null,
          GQ: parseInt(formatObj.GQ) || null,
          GL: formatObj.GL || null,
          DP: parseInt(formatObj.DP) || null,
          SP: parseInt(formatObj.SP) || null,
          PL: formatObj.PL || null
        }
      });
    }

    try {
      await Variants.findOneAndUpdate(
        { CHROM, POS },
        {
          $set: {
            ID,
            QUAL,
            FILTER,
            CHROM,
            POS,
            accession_name: accessionName,
            gene_name: geneName,
            impact: impact,
            vcf_filename: vcfName,
            info: {
              REF,
              ALT,
              DP: parseInt(infoMap.DP) || null,
              DP4: infoMap.DP4 || null,
              MQ: parseInt(infoMap.MQ) || null,
              FQ: parseFloat(infoMap.FQ) || null,
              AF1: parseFloat(infoMap.AF1) || null,
              CI95: infoMap.CI95 || null,
              PV4: infoMap.PV4 || null,
              INDEL: infoMap.INDEL !== undefined,
              PC2: infoMap.PC2 || null,
              PCHI2: parseFloat(infoMap.PCHI2) || null,
              QCHI2: parseInt(infoMap.QCHI2) || null,
              RP: parseInt(infoMap.RP) || null,
              EFF: infoMap.EFF || null
            },
            samples
          }
        },
        { upsert: true, new: true, runValidators: true }
      );

      processedCount++;
      if (processedCount % 1000 === 0) {
        console.log(`🔄 Processed ${processedCount} variants so far...`);
      }
    } catch (err) {
      console.error(`❌ Failed to upsert variant at ${CHROM}:${POS} -`, err.message);
      process.exit(1);
    }
  }

  console.log(`✅ Finished processing: ${filepath}`);
  console.log(`📊 Total variants processed: ${processedCount}`);
  console.log(`📭 Skipped variants without gene: ${skippedCount}`);
  console.timeEnd("⏱️ Total Processing Time");
};

module.exports = parseVCF;

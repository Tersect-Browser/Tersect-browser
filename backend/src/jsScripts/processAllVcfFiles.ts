import * as fs from 'fs';
import * as path from 'path';
const pLimit = require('p-limit');

const parseVCF = require('./parseVcfFile');

const run = async () => {
  const vcfLocation = process.argv[2];
  const accessionMappingPath = process.argv[3];

  console.log(`📁 Provided directory: ${vcfLocation}`);
  console.log(`📄 Accession mapping file: ${accessionMappingPath}`);

  if (!vcfLocation || !accessionMappingPath) {
    console.error("❌ Error: Both VCF directory and accession mapping file must be provided.");
    return;
  }

  let stats;
  try {
    stats = fs.lstatSync(vcfLocation);
    if (!stats.isDirectory()) {
      console.error("❌ Error: Provided path is not a directory.");
      return;
    }
  } catch (err) {
    console.error(`❌ Error accessing VCF directory: ${err.message}`);
    return;
  }

  let mappingRaw;
  try {
    mappingRaw = fs.readFileSync(accessionMappingPath, 'utf8');
  } catch (err) {
    console.error(`❌ Error reading accession mapping file: ${err.message}`);
    return;
  }

  const mapping: Record<string, string> = {};
  mappingRaw.split('\n').forEach(line => {
    const [filename, accession] = line.trim().split(/\t/);
    if (filename && accession) {
      mapping[filename] = accession;
    }
  });

  try {
    const files = fs.readdirSync(vcfLocation);
    const vcfFiles = files.filter(file => file.toLowerCase().endsWith('.vcf.gz'));

    if (vcfFiles.length === 0) {
      console.log("ℹ️ No .vcf.gz files found in the directory.");
      return;
    }

    const limit = pLimit(10); // 👈 Adjust concurrency here

    const tasks = vcfFiles.map(file => limit(async () => {
      const accession = mapping[file];
      if (!accession) {
        console.warn(`⚠️  No mapping found for ${file}`);
        return;
      }

      console.log(`📄 Processing file: ${file}`);
      console.log(`🔗 Accession name: ${accession}`);

      const filePath = path.join(vcfLocation, file);
      await parseVCF(filePath, accession, file);
    }));

    await Promise.all(tasks);
    console.log("✅ All VCF files mapped and processed.");
  } catch (err) {
    console.error("❌ Error during processing:", err.message);
  }
};

run();

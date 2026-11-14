import {
    spawn,
    execFile
} from 'node:child_process';
import * as readline from 'node:readline';

import {
    Request,
    Response,
    Router
} from 'express';
import * as fs from 'node:fs';
import { access, readdir, stat } from 'node:fs/promises';
import Hashids from 'hashids';
import * as path from 'node:path';

import {
    DistanceBinQuery,
    DistanceBins
} from '../../../common/DistanceBins';
import {
    TreeDatabaseQuery,
    TreeQuery
} from '../../../common/PheneticTree';

import { tbConfig } from '../load-config';
import { ChromosomeIndex } from '../models/chromosomeindex';
import { Dataset, DatasetPublic } from '../models/dataset';
import { NewickTree } from '../models/newicktree';
import { ViewSettings } from '../models/viewsettings';
import { formatRegion, resolveTsiPath, runCommand, writeAccessions } from '../utils/utils';
import {
    accessionOf,
    accessionsOf,
    datasetSamples,
    identifier,
    integer,
    oneOf,
    regionOf,
    ValidationError
} from '../utils/validate';
import { collectSampleNames, Pool, processKeys } from '../utils/pool';
import introgressionController from './introgression-router';
import { generateTree } from '../controllers/generateTree';
import { subscribeSSE, unsubscribeSSE } from './sse';





// Recursive function to find the file by name
async function findFileRecursive(dir, targetFileName) {
    let entries;
    try {
        entries = await readdir(dir);
    } catch (err) {
        return null; // Can't read directory
    }

    for (const entry of entries) {
        const fullPath = path.join(dir, entry);
        let stats;
        try {
            stats = await stat(fullPath);
        } catch (err) {
            continue; // Skip unreadable entries
        }

        if (stats.isDirectory()) {
            const found = await findFileRecursive(fullPath, targetFileName);
            if (found) return found;
        } else if (entry === targetFileName) {
            return fullPath;
        }
    }

    return null;
}

/** snpEff impact levels accepted by the variant search. */
const IMPACT_LEVELS = ['HIGH', 'MODERATE', 'LOW', 'MODIFIER'] as const;

// Per-chromosome variant indices built by build_annotate_per_chrom.sh
const DATA_DIR = path.join(tbConfig.localDbPath, 'gp_data_copy', 'trix_indices');

export const router = Router();

/**
 * Save list of accessions into a temporary file and return the file name.
 */





// CORS middleware
router.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');

    next();
});

router.use('/query/:datasetId', async (req, res, next) => {
    let dataset: Dataset | null;
    try {
        dataset = await Dataset.findOne({ _id: req.params.datasetId }).exec();
    } catch (err) {
        res.send(err);
        return;
    }
    if (!dataset) {
        res.status(404).send('Dataset not found');
        return;
    }
    dataset.tsi_location = resolveTsiPath(dataset.tsi_location);
    res.locals.dataset = dataset;
    res.locals.datasetId = dataset._id;
    return next();
})


router.get('/sse/:datasetId/:accKey', (req, res) => {
  const { accKey } = req.params;


  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  subscribeSSE(res, accKey);

  // optional auto-retry hint
  res.write('retry: 3000\n\n');



  // keep-alive ping prevents idle timeouts
  const hb = setInterval(() => res.write(`: ping ${Date.now()}\n\n`), 25000);

  req.on('close', () => {
    clearInterval(hb);
    unsubscribeSSE(res, accKey);
    try { res.end(); } catch {}
  });
});

router.get('/datafiles/:filename', async (req, res) => {
    const localDbLocation = tbConfig.localDbPath;
    const fileName = req.params.filename;
    const searchRoot = path.join(localDbLocation, 'gp_data_copy');

    try {

        const foundFilePath = await findFileRecursive(searchRoot, fileName);

        if (!foundFilePath) {
            return res.status(404).send('File not found');
        }
        res.type('application/octet-stream'); // Or whatever the actual file type is

        await access(foundFilePath, fs.constants.R_OK);

        res.sendFile(foundFilePath, (err) => {
            if (err) {
                if (err.message === 'EACCES') {
                    return res.status(403).send('Permission denied while sending file');
                } else {
                    console.error('Error sending file:', err);
                    res.status(500).send('Internal Server Error');
                }
            }
        });

    } catch (err) {
        if (err.code === 'EACCES') {
            return res.status(403).send('Permission denied while accessing file');
        } else {
            console.error('Unexpected error during file search:', err);
            res.status(500).send('Internal Server Error');
        }
    }
});





router.route('/query/:datasetId/samples')
    .get(async (req, res) => {
        try {
            const samples = await datasetSamples(res.locals.dataset.tsi_location);
            res.json([...samples]);
        } catch (err) {
            console.error('Error executing tersect samples:', err);
            res.status(500).send('Accessions could not be retrieved');
        }
    });


router.route(
  '/query/:datasetId/variants/:chrom').get(async (req, res, next) => {
    try {
      /* ───────── 0. Params & validation ───────── */
      // These end up in a bcftools filter expression, so only known values
      // are accepted.
      const dataset = res.locals.dataset;
      const chrom   = req.params.chrom;
      let start: number, end: number, filter: string, gene: string | undefined;
      try {
        [start, end] = await regionOf(dataset, chrom,
                                      [req.query.start, req.query.end]);
        filter = oneOf(req.query.filter ?? 'HIGH', 'filter', IMPACT_LEVELS);
        gene = req.query.term ? identifier(req.query.term, 'term') : undefined;
      } catch (error) {
        if (error instanceof ValidationError) {
          return res.status(400).json({ error: error.message });
        }
        throw error;
      }
      const tsiPath = dataset.tsi_location;

      const vcfPath = path.join(DATA_DIR, 'all_samples.vcf.gz');
      if (!fs.existsSync(vcfPath))
        return res.status(404).json({ error: 'VCF not found' });

      /* ───────── 1. Run bcftools ───────── */
      const region   = `${chrom}:${start}-${end}`;

       const withGene = (gene: string, filter: string) => {
          const expression = `INFO/EFF~"${gene}" && INFO/EFF~"${filter}"`;
        return spawn('bcftools', [
            'query',
            '-i', expression,
            '-f', '%CHROM:%POS:%REF:%ALT\t%INFO/EFF\n',
            vcfPath,
        ]);
        };

      const withoutGene =(filter:string) => {
        return spawn('bcftools', [
        'query',
        '-i', `INFO/EFF~"${filter}"`,
        '-r', region,
        '-f', '%CHROM:%POS:%REF:%ALT\t%INFO/EFF\n',
        vcfPath,
      ]);
      }
      const bcftools = gene ? withGene(gene, filter): withoutGene(filter);


      bcftools.stderr.on('data', b =>
        console.error('[bcftools]', b.toString().trim())
      );

      bcftools.on('close', (code) => {
        if (code !== 0) {
            console.error(`[bcftools] exited with code ${code}`);
        }
        });

      /* ───────── 2. Collect output ───────── */
      const lines: { key: string; eff: string }[] = [];
      const keys  = new Set<string>();
      const rl = readline.createInterface({ input: bcftools.stdout });

      for await (const line of rl) {
        if (!line) continue;
        const tab = line.indexOf('\t');
        const key = line.slice(0, tab);          // CHROM:POS:REF:ALT
        const eff = line.slice(tab + 1);         // INFO/EFF
        lines.push({ key, eff });
        keys.add(key);
      }
      rl.close();


    const tsiResults = await processKeys(keys, tsiPath);

    const allSampleNames = collectSampleNames(tsiResults as unknown as [string, string][])


      const accMap = new Map<string, string>(
        tsiResults as unknown as [string, string][]
        );

      const variants = lines.map(({ key, eff }) => {
        const [chr, pos, ref, alt] = key.split(':');

        // `tersectForKey` gives a single comma-separated string (or undefined)
        const accStr = accMap.get(key) ?? '';
        const accessions = accStr
            .split(/[, \t]+/)       // split on commas *or* stray whitespace
            .filter(Boolean);       // drop empties

        return {
            chr,
            pos: { start: Number(pos) },
            ref,
            alt,
            eff,                    // keep INFO/EFF
            accessions,             // ← the per-variant list
        };
        });

        return res.status(200).json({
        region,
        filter,
        count: variants.length,
        variants,
        totalAccessions:  Array.from(new Set(allSampleNames))         // each item already contains its accession list
        });
    } catch (err) {
      console.error(err);
      next(err);
    }
  },
);


router.route('/query/:datasetId/chromosomes')
    .get(async (req, res) => {
        try {
            const chroms = await ChromosomeIndex.find({
                reference: res.locals.dataset.reference
            }, { 'name': 1, 'size': 1, '_id': 0 }).exec();
            if (!chroms) {
                res.status(404).send('Chromosomes not found');
            } else {
                res.json(chroms);
            }
        } catch (err) {
            res.send(err);
        }
    });

router.route('/query/:datasetId/gaps/:chromosome')
    .get(async (req, res) => {
        try {
            const gaps = await ChromosomeIndex.findOne({
                reference: res.locals.dataset.reference,
                name: req.params.chromosome
            }, 'gaps').exec();
            if (!gaps) {
                res.status(404).send('Chromosome not found');
            } else {
                res.json(gaps['gaps']);
            }
        } catch (err) {
            res.send(err);
        }
    });

router.route('/query/:datasetId/dist')
    .post(async (req, res) => {
        const dataset = res.locals.dataset;
        const query: DistanceBinQuery = req.body ?? {};
        let accFile: string | undefined;
        try {
            const [start, end] = await regionOf(dataset, query.chromosome_name,
                                                query.interval);
            const reference = await accessionOf(dataset, query.reference,
                                                'reference');
            const accessions = await accessionsOf(dataset, query.accessions);
            const binsize = integer(query.binsize, 'binsize', 1, 100_000_000);

            accFile = await writeAccessions(accessions);
            const stdout = await runCommand('tersect', [
                'dist', '-j', dataset.tsi_location,
                '-a', reference,
                '--b-list-file', accFile,
                formatRegion(query.chromosome_name, start, end),
                '-B', String(binsize),
            ], { maxBuffer: 200 * 1024 * 1024 });

            const tersectOutput = JSON.parse(stdout);
            const columns: string[] = tersectOutput['columns'];
            const output: DistanceBins = { query, bins: {} };
            columns.forEach(accession => { output.bins[accession] = []; });
            tersectOutput['matrix'].forEach((binMatrix: number[][]) => {
                binMatrix[0].forEach((dist: number, i: number) => {
                    output.bins[columns[i]].push(dist);
                });
            });
            res.json(output);
        } catch (error) {
            if (error instanceof ValidationError) {
                res.status(400).send(error.message);
            } else {
                console.error('Distance calculation failed:', error);
                res.status(500).send('Distances could not be calculated');
            }
        } finally {
            if (accFile) {
                fs.promises.unlink(accFile).catch(() => {});
            }
        }
    });

router.route('/datasets')
    .get(async (req, res) => {
        try {
            const r = await Dataset.find().exec();
            const output: DatasetPublic[] = r.map(dataset => {
                return {
                    dataset_id: dataset._id,
                    view_id: dataset.view_id,
                    reference: dataset.reference
                };
            });
            res.json(output);
        } catch (err) {
            res.json(undefined);
        }
    });

router.route('/views/share/:id')
    .get(async (req, res) => {
        try {
            const r = await ViewSettings.findOne({ '_id': req.params.id })
                                        .exec();
            res.json(r ? r['settings'] : undefined);
        } catch (err) {
            res.json(undefined);
        }
    });

const DEFAULT_VIEW_SALT = 'tersectsalt';
const MAX_VIEW_ID = 2000000000;

function randomHash(): string {
    const hash = new Hashids(DEFAULT_VIEW_SALT);
    return hash.encode(Math.floor(Math.random() * MAX_VIEW_ID));
}

async function exportView(req: Request, res: Response) {
    const nextId = randomHash();
    // Casting to any to fix compilation bug where the settings are not
    // recognized as a known property
    // TODO: match interface to mongoose schema
    const exportedView = new ViewSettings({
        _id: nextId,
        settings: req.body
    } as any);
    try {
        await exportedView.save();
        res.json(nextId);
    } catch (err) {
        if (err.code === 11000) {
            // Duplicate key error, retry
            await exportView(req, res);
        } else {
            res.json(err);
        }
    }
}

router.route('/views/export')
    .post(exportView);

router.route('/query/:datasetId/tree')
    .post(async (req, res) => {
        try {
            const dataset = res.locals.dataset;
            const tsiLocation = dataset.tsi_location;
            const treeQuery: TreeQuery = req.body ?? {};
            await regionOf(dataset, treeQuery.chromosomeName, treeQuery.interval);
            await accessionsOf(dataset, treeQuery.accessions);
            const dbQuery: TreeDatabaseQuery = {
                datasetId: req.params.datasetId,
                'query.chromosomeName': treeQuery.chromosomeName,
                'query.interval': treeQuery.interval,
                'query.accessions': treeQuery.accessions
            };

            const result = await NewickTree.findOne(dbQuery).exec();
            if (result) {
                // Retrieved previously generated tree
                return res.json(result);
            }

            // Generating new tree
            const phyloTree = await new NewickTree({
                datasetId: req.params.datasetId,
                'query.chromosomeName': treeQuery.chromosomeName,
                'query.interval': treeQuery.interval,
                'query.accessions': treeQuery.accessions,
                status: 'Collating data...'
            }).save();
            // Runs in the background; the client polls this route for status.
            // A failure left unhandled here would terminate the process.
            new Promise(resolve => {
                resolve(generateTree(tsiLocation, treeQuery, dbQuery));
            }).catch(async err => {
                console.error('Tree generation failed:', err);
                // Clients poll the status, so record the failure. Unfinished
                // trees are removed when the server starts, allowing a retry.
                await NewickTree.updateOne(dbQuery, {
                    status: 'Error: the tree could not be built'
                }).exec().catch(() => {});
            });
            res.json(phyloTree);
        } catch (error) {
            if (error instanceof ValidationError) {
                return res.status(400).send(error.message);
            }
            console.log('Error creating tree');
            console.log(error);
            res.status(500).send('Tree creation failed');
        }


    });

router.route('/query/:datasetId/generate-barcodes').post(async (req, res) => {
    const dataset = res.locals.dataset;
    const body = req.body ?? {};
    let args: string[];
    try {
        const accession = await accessionOf(dataset, body.accessionName);
        const [start, end] = await regionOf(dataset, body.chrom,
                                            [body.start, body.end]);
        const size = integer(body.size, 'size', 10, 1000);
        const maxVar = body.maxVar === null || body.maxVar === undefined
            ? 'null' : String(integer(body.maxVar, 'maxVar', 0, 1000));
        // The dataset's reference prepared by prepare_genome_browser.py,
        // otherwise the reference named in tbconfig.json.
        const datasetReference = path.join(
            tbConfig.localDbPath, 'gp_data_copy', 'genomes',
            String(dataset._id).replace(/[^A-Za-z0-9._-]+/g, '_'),
            'reference.fa.gz');
        const fastaFile = fs.existsSync(datasetReference)
            ? datasetReference
            : path.join(tbConfig.localDbPath, 'gp_data_copy', tbConfig.fastaName);
        args = [accession, body.chrom, String(start), String(end),
                String(size), maxVar, fastaFile, dataset.tsi_location,
                tbConfig.localDbPath];
    } catch (error) {
        if (error instanceof ValidationError) {
            return res.status(400).send(error.message);
        }
        console.error(error);
        return res.status(500).send('Error running barcode script!');
    }

    const scriptPath = path.join(__dirname, '../scripts/barcode_finder.sh');
    execFile(scriptPath, args, (error, stdout) => {
        if (error) {
            console.error('Shell script error:', error);
            return res.status(500).send('Error running barcode script!');
        }
        // The script reports the output file on its last line.
        const lines = stdout.trim().split('\n');
        const filename = path.basename(lines[lines.length - 1].trim());
        const downloadableURL = `${tbConfig.serverHost}/datafiles/barcodes/${encodeURIComponent(filename)}`;
        res.json({ downloadableURL });
    });
});



router.route('/query/:datasetId/scan-introgression')
  .post(introgressionController);










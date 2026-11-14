import {
    execFile
} from 'node:child_process';

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
    chromosomeOf,
    datasetSamples,
    identifier,
    integer,
    oneOf,
    regionOf,
    ValidationError
} from '../utils/validate';
import {
    IMPACT_LEVELS,
    searchGenes,
    variantsInGene,
    variantsInInterval
} from '../utils/variant-store';
import { binnedDistances } from '../utils/window-trees';
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


/** Answers a variant search, or 404 for datasets built without VCF files. */
async function variantSearch(req: Request, res: Response,
                             run: (dataset: Dataset) => Promise<unknown>) {
    const dataset: Dataset = res.locals.dataset;
    if (!dataset.variant_search) {
        res.status(404).json({ error: 'This dataset has no variant search; '
                                      + 'it was not built from VCF files.' });
        return;
    }
    try {
        res.json(await run(dataset));
    } catch (error) {
        if (error instanceof ValidationError) {
            res.status(400).json({ error: error.message });
            return;
        }
        console.error('Variant search failed:', error);
        res.status(500).json({ error: 'The variant search failed' });
    }
}

// Variants in an interval with an effect of the given impact (default HIGH).
router.get('/query/:datasetId/variants/:chrom', (req, res) =>
    variantSearch(req, res, async dataset => {
        const [start, end] = await regionOf(dataset, req.params.chrom,
                                            [req.query.start, req.query.end]);
        const impact = oneOf(req.query.filter ?? 'HIGH', 'filter', IMPACT_LEVELS);
        return variantsInInterval(dataset._id, req.params.chrom, start, end, impact);
    }));

// Variants affecting a gene, optionally limited to one impact level.
router.get('/query/:datasetId/genes/:gene/variants', (req, res) =>
    variantSearch(req, res, async dataset => {
        const gene = identifier(req.params.gene, 'gene');
        const impact = req.query.filter === undefined ? undefined
            : oneOf(req.query.filter, 'filter', IMPACT_LEVELS);
        return variantsInGene(dataset._id, gene, impact);
    }));

// Gene suggestions: id, name or description containing `q`.
router.get('/query/:datasetId/genes', (req, res) =>
    variantSearch(req, res, async dataset => {
        const term = typeof req.query.q === 'string' ? req.query.q.trim() : '';
        if (term.length < 2 || term.length > 100) {
            throw new ValidationError('q must be 2 to 100 characters');
        }
        let chromosome: string | undefined;
        if (req.query.chrom !== undefined) {
            chromosome = String(req.query.chrom);
            await chromosomeOf(dataset, chromosome);
        }
        const limit = req.query.limit === undefined ? 20
            : integer(req.query.limit, 'limit', 1, 100);
        return searchGenes(dataset._id, term, chromosome, limit);
    }));


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

            if (dataset.variant_search && dataset.tersect) {
                const bins = await binnedDistances(
                    dataset._id, query.chromosome_name, start, end, binsize,
                    reference, accessions, dataset.tersect);
                res.json({ query, bins } satisfies DistanceBins);
                return;
            }

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
            // Accession counts from each dataset's default view.
            const views = await ViewSettings.find(
                { _id: { $in: r.map(dataset => dataset.view_id) } },
                { 'settings.accession_infos.id': 1 }).lean().exec();
            const counts = new Map(views.map((view: any) => [
                view._id, view.settings?.accession_infos?.length]));
            const output: DatasetPublic[] = r.map(dataset => {
                return {
                    dataset_id: dataset._id,
                    view_id: dataset.view_id,
                    reference: dataset.reference,
                    description: dataset.description ?? '',
                    variant_search: dataset.variant_search === true,
                    accession_count: counts.get(dataset.view_id)
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
        // The dataset's reference, prepared by the dataset pipeline.
        const fastaFile = path.join(
            tbConfig.localDbPath, 'gp_data_copy', 'genomes',
            String(dataset._id).replace(/[^A-Za-z0-9._-]+/g, '_'),
            'reference.fa.gz');
        if (!fs.existsSync(fastaFile)) {
            return res.status(404).send(
                'This dataset has no reference sequence, so barcodes cannot be generated.');
        }
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
        const outputPath = lines[lines.length - 1].trim();
        const filename = path.basename(outputPath);
        const downloadableURL = `${tbConfig.serverHost}/datafiles/barcodes/${encodeURIComponent(filename)}`;
        // Barcodes are the rows after the '#' comment and header lines.
        fs.promises.readFile(outputPath, 'utf8')
            .then(text => text.split('\n')
                              .filter(line => line && !line.startsWith('#')).length)
            .catch(() => undefined)
            .then(count => res.json({ downloadableURL, filename, count }));
    });
});



router.route('/query/:datasetId/scan-introgression')
  .post(introgressionController);










import { exec, spawn } from 'child_process';
import { Router } from 'express';
import * as fs from 'fs';
import { default as Hashids } from 'hashids';
import * as path from 'path';
import { fromEvent, merge } from 'rxjs';
import {
    concatMap,
    map,
    reduce,
    take,
    takeUntil,
    throttleTime
} from 'rxjs/operators';
import { fileSync } from 'tmp';
import { promisify } from 'util';

import { DistanceBinQuery } from '../app/models/DistanceBinQuery';
import { TreeDatabaseQuery, TreeQuery } from '../app/models/TreeQuery';
import { formatRegion, isNullOrUndefined } from '../app/utils/utils';

import { ChromosomeIndex } from './models/chromosomeindex';
import { Dataset, DatasetPublic } from './models/dataset';
import { DBMatrix } from './models/dbmatrix';
import { PheneticTree } from './models/phenetictree';
import { ViewSettings } from './models/viewsettings';
import { partitionQuery } from './partitioning';

export const router = Router();

function loadConfig() {
    const contents = fs.readFileSync(path.join(__dirname, 'config.json'));
    return JSON.parse(contents.toString());
}

const config = loadConfig();

function execPromise(command: string, options = {}) {
    return new Promise((resolve, reject) => {
        exec(command, options, (error, stdout, stderr) => {
            if (error) {
                reject(error);
                return;
            } else if (stderr) {
                reject(stderr);
                return;
            }
            resolve(stdout);
        });
    });
}

// CORS middleware
router.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    next();
});

router.use('/query/:dataset_id', (req, res, next) => {
    Dataset.findOne({ _id: req.params.dataset_id })
           .exec((err, dataset: Dataset) => {
        if (err) {
            res.send(err);
            return;
        } else if (isNullOrUndefined(dataset)) {
            res.status(404).send('Dataset not found');
            return;
        } else {
            res.locals.dataset = dataset;
            return next();
        }
    });
});

router.route('/query/:dataset_id/samples')
      .get((req, res) => {
    const options = {
        maxBuffer: 5 * 1024 * 1024 // 5 megabytes
    };
    const tsi_location = res.locals.dataset.tsi_location;
    const tersectCommand = `tersect samples -n ${tsi_location}`;
    exec(tersectCommand, options, (err, stdout, stderr) => {
        if (err) {
            res.json(err);
        } else if (stderr) {
            res.json(stderr);
        } else {
            // Strip the last, empty element
            const samples = stdout.split('\n').slice(0, -1);
            res.json(samples);
        }
    });
});

router.route('/query/:dataset_id/chromosomes')
      .get((req, res) => {
    ChromosomeIndex.find({
        reference: res.locals.dataset.reference
    }, {'name': 1, 'size': 1, '_id': 0}).exec((err, chroms) => {
        if (err) {
            res.send(err);
        } else if (isNullOrUndefined(chroms)) {
            res.status(404).send('Chromosomes not found');
        } else {
            res.json(chroms);
        }
    });
});

router.route('/query/:dataset_id/gaps/:chromosome')
      .get((req, res) => {
    ChromosomeIndex.findOne({
        reference: res.locals.dataset.reference,
        name: req.params.chromosome
    }, 'gaps').exec((err, gaps) => {
        if (err) {
            res.send(err);
        } else if (isNullOrUndefined(gaps)) {
            res.status(404).send('Chromosome not found');
        } else {
            res.json(gaps['gaps']);
        }
    });
});

router.route('/query/:dataset_id/dist')
      .post((req, res) => {
    const options = {
        maxBuffer: 200 * 1024 * 1024 // 200 megabytes
    };

    const tsi_location = res.locals.dataset.tsi_location;
    const distBinQuery: DistanceBinQuery = req.body;

    const region = formatRegion(distBinQuery.chromosome_name,
                                distBinQuery.interval[0],
                                distBinQuery.interval[1]);

    const reference = distBinQuery.reference;
    const binsize = distBinQuery.binsize;

    write_accessions(distBinQuery.accessions).then((accFile) => {
        const tersectCommand = `tersect dist -j ${tsi_location} \
-a "${reference}" --b-list-file ${accFile} ${region} -B ${binsize}`;

        const output = {
            reference: reference,
            region: region,
            bins: {}
        };

        exec(tersectCommand, options, (err, stdout, stderr) => {
            if (err) {
                res.json(err);
            } else if (stderr) {
                res.json(stderr);
            } else {
                const tersectOutput = JSON.parse(stdout);
                const accessions = tersectOutput['columns'];
                accessions.forEach(accessionName => {
                    output.bins[accessionName] = [];
                });
                tersectOutput['matrix'].forEach(binMatrix => {
                    binMatrix[0].forEach((dist: number, i: number) => {
                        output.bins[accessions[i]].push(dist);
                    });
                });
                res.json(output);
            }
        });
    });
});

router.route('/datasets')
      .get((req, res) => {
    Dataset.find().exec((err, r: Dataset[]) => {
        if (err || isNullOrUndefined(r)) {
            res.json(undefined);
        } else {
            const output: DatasetPublic[] = r.map(dataset => {
                return {
                    dataset_id: dataset._id,
                    view_id: dataset.view_id,
                    reference: dataset.reference
                };
            });
            res.json(output);
        }
    });
});

router.route('/views/share/:id')
      .get((req, res) => {
    ViewSettings.findOne({ '_id': req.params.id })
                .exec((err, r) => {
        if (err || isNullOrUndefined(r)) {
            res.json(undefined);
        } else {
            res.json(r['settings']);
        }
    });
});

const MAX_VIEW_ID = 2000000000;

function randomHash(): string {
    const hash = new Hashids(config['salt']);
    return hash.encode(Math.floor(Math.random() * MAX_VIEW_ID));
}

function exportView(req, res) {
    const nextId = randomHash();
    // Casting to any to fix compilation bug where the settings are not
    // recognized as a known property
    // TODO: match interface to mongoose schema
    const exportedView = new ViewSettings({
        _id: nextId,
        settings: req.body
    } as any);
    exportedView.save(err => {
        if (err) {
            if (err.code === 11000) {
                // Duplicate key error, retry
                exportView(req, res);
            } else {
                res.json(err);
            }
            return;
        }
        res.json(nextId);
    });
}

router.route('/views/export')
      .post(exportView);

router.route('/query/:dataset_id/tree')
      .post((req, res) => {
    const tsi_location = res.locals.dataset.tsi_location;
    const treeQuery: TreeQuery = req.body;
    const dbQuery: TreeDatabaseQuery = {
        dataset_id: req.params.dataset_id,
        'query.chromosome_name': treeQuery.chromosome_name,
        'query.interval': treeQuery.interval,
        'query.accessions': treeQuery.accessions
    };
    PheneticTree.findOne(dbQuery)
                .exec((err, result: PheneticTree) => {
        if (err) {
            return res.status(500).send('Tree creation failed');
        } else if (isNullOrUndefined(result)) {
            // Generating new tree
            const phyloTree = new PheneticTree({
                dataset_id: req.params.dataset_id,
                'query.chromosome_name': treeQuery.chromosome_name,
                'query.interval': treeQuery.interval,
                'query.accessions': treeQuery.accessions,
                status: 'Collating data...'
            }).save((saveErr: any) => {
                if (saveErr) {
                    return res.status(500).send('Tree creation failed');
                }
                generate_tree(tsi_location, treeQuery, dbQuery);
            });
            res.json(phyloTree);
        } else {
            // Retrieved previously generated tree
            res.json(result);
        }
    });
});

function create_rapidnj_tree(dbQuery: TreeDatabaseQuery, phylipFile: string) {
    const rapidnj = spawn('rapidnj', ['-i', 'pd', phylipFile]);

    const stdoutClose$ = fromEvent(rapidnj.stdout, 'close').pipe(take(1));
    const stderrClose$ = fromEvent(rapidnj.stderr, 'close').pipe(take(1));

    const progress$ = fromEvent(rapidnj.stderr, 'data').pipe(
        takeUntil(stderrClose$),
        throttleTime(500),
        map(data => {
            const statusUpdates = data.toString().trim().split(' ');
            const percentage = statusUpdates[statusUpdates.length - 1].trim();
            return percentage;
        }),
        map(percentage => `Building tree: ${percentage}`),
        map(statusUpdate => ({ status: statusUpdate }))
    );

    const result$ = fromEvent(rapidnj.stdout, 'data').pipe(
        takeUntil(stdoutClose$),
        reduce((newickOutput, chunk) => newickOutput + chunk, ''),
        map(newickOutput => ({
            status: 'ready',
            tree_newick: newickOutput
        }))
    );

    merge(progress$, result$).pipe(
        concatMap(update => PheneticTree.updateOne(dbQuery, update))
    ).subscribe(() => {});
}

/**
 * Save list of accessions into a temporary file and return the file name.
 */
async function write_accessions(accessions: string[]): Promise<string> {
    const outputFile = fileSync();
    await promisify(fs.writeFile)(outputFile.name, accessions.join('\n') + '\n');
    return outputFile.name;
}

function generate_tree(tsiLocation: string, treeQuery: TreeQuery,
                       dbQuery: TreeDatabaseQuery) {
    const partitions = partitionQuery(tsiLocation, config['index_partitions'],
                                      treeQuery);

    const dbFiles = partitions.indexed.map(async interval => {
        const region = formatRegion(treeQuery.chromosome_name, interval.start,
                                    interval.end);
        const result = await DBMatrix.findOne(
            { dataset_id: dbQuery.dataset_id, region: region },
            { _id: 0, matrix_file: 1 }
        );
        return result['matrix_file'];
    });

    const tersectOutputFiles = partitions.nonindexed.map(async interval => {
        const outputFile = fileSync();
        const region = formatRegion(treeQuery.chromosome_name, interval.start,
                                    interval.end);
        const command = `tersect dist ${tsiLocation} ${region} > ${outputFile.name}`;
        const result = await execPromise(command);
        // TODO: error handling on tersect result / promise rejection
        return outputFile.name;
    });

    const positiveMatrixFiles = [];
    const negativeMatrixFiles = [];

    partitions.indexed.forEach((interval, i) => {
        if (interval.type === 'add') {
            positiveMatrixFiles.push(dbFiles[i]);
        } else if (interval.type === 'subtract') {
            negativeMatrixFiles.push(dbFiles[i]);
        }
    });
    partitions.nonindexed.forEach((interval, i) => {
        if (interval.type === 'add') {
            positiveMatrixFiles.push(tersectOutputFiles[i]);
        } else if (interval.type === 'subtract') {
            negativeMatrixFiles.push(tersectOutputFiles[i]);
        }
    });

    const inputFiles = [
        write_accessions(treeQuery.accessions),
        ...positiveMatrixFiles,
        ...negativeMatrixFiles
    ];

    Promise.all(inputFiles).then(([accFile, ...matrixFiles]) => {
        const positive = matrixFiles.slice(0, positiveMatrixFiles.length)
                                     .join(' ');
        const negative = matrixFiles.slice(positiveMatrixFiles.length,
                                            matrixFiles.length).join(' ');
        const script = path.join(__dirname, 'merge_phylip.py');
        let mergeCommand: string;
        if (negative.length) {
            mergeCommand = `${script} ${tsiLocation} ${positive} -n ${negative} -a ${accFile}`;
        } else {
            mergeCommand = `${script} ${tsiLocation} ${positive} -a ${accFile}`;
        }
        return execPromise(mergeCommand);
    }).then((outputFilename: string) => {
        create_rapidnj_tree(dbQuery, outputFilename.trim());
    });
}

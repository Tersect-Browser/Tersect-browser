import * as fs from 'fs';
import * as path from 'path';

import { Router } from 'express';
import { exec, spawn } from 'child_process';

import { DBMatrix } from './db/dbmatrix';
import { ChromosomeIndex } from './db/chromosomeindex';
import { ViewSettings } from './db/viewsettings';

import { default as Hashids } from 'hashids';
import { isNullOrUndefined, promisify } from 'util';
import { Dataset, IDataset, IDatasetPublic } from './db/dataset';
import { PheneticTree } from './db/phenetictree';
import { TreeQuery, TreeDatabaseQuery } from '../app/models/TreeQuery';
import { fileSync, } from 'tmp';
import { partitionQuery } from './partitioning';
import { formatRegion } from '../app/utils/utils';
import { fromEvent, merge } from 'rxjs';
import { map, take, takeUntil, reduce, concatMap, throttleTime } from 'rxjs/operators';
import { RefDistQuery } from '../app/models/RefDistQuery';

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
           .exec((err, dataset: IDataset) => {
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
    const tersect_command = `tersect samples -n ${tsi_location}`;
    exec(tersect_command, options, (err, stdout, stderr) => {
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
    const ref_dist_query: RefDistQuery = req.body;

    const region = formatRegion(ref_dist_query.chromosome_name,
                                ref_dist_query.interval[0],
                                ref_dist_query.interval[1]);

    const reference = ref_dist_query.reference;
    const binsize = ref_dist_query.binsize;

    write_accessions(ref_dist_query.accessions).then((acc_file) => {
        const tersect_command = `tersect dist -j ${tsi_location} \
-a "${reference}" --b-list-file ${acc_file} ${region} -B ${binsize}`;

        const output = {
            reference: reference,
            region: region,
            bins: {}
        };

        exec(tersect_command, options, (err, stdout, stderr) => {
            if (err) {
                res.json(err);
            } else if (stderr) {
                res.json(stderr);
            } else {
                const tersect_output = JSON.parse(stdout);
                const accessions = tersect_output['columns'];
                accessions.forEach(accession_name => {
                    output.bins[accession_name] = [];
                });
                tersect_output['matrix'].forEach(bin_matrix => {
                    bin_matrix[0].forEach((dist: number, i: number) => {
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
    Dataset.find().exec((err, r: IDataset[]) => {
        if (err || isNullOrUndefined(r)) {
            res.json(undefined);
        } else {
            const output: IDatasetPublic[] = r.map(dataset => {
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
    const next_id = randomHash();
    // Casting to any to fix compilation bug where the settings are not
    // recognized as a known property
    // TODO: match interface to mongoose schema
    const exported_view = new ViewSettings({
        _id: next_id,
        settings: req.body
    } as any);
    exported_view.save(err => {
        if (err) {
            if (err.code === 11000) {
                // Duplicate key error, retry
                exportView(req, res);
            } else {
                res.json(err);
            }
            return;
        }
        res.json(next_id);
    });
}

router.route('/views/export')
      .post(exportView);

router.route('/query/:dataset_id/tree')
      .post((req, res) => {
    const tsi_location = res.locals.dataset.tsi_location;
    const tree_query: TreeQuery = req.body;
    const db_query: TreeDatabaseQuery = {
        dataset_id: req.params.dataset_id,
        'query.chromosome_name': tree_query.chromosome_name,
        'query.interval': tree_query.interval,
        'query.accessions': tree_query.accessions
    };
    PheneticTree.findOne(db_query)
                .exec((err, result: PheneticTree) => {
        if (err) {
            return res.status(500).send('Tree creation failed');
        } else if (isNullOrUndefined(result)) {
            // Generating new tree
            const phylo_tree = new PheneticTree({
                dataset_id: req.params.dataset_id,
                'query.chromosome_name': tree_query.chromosome_name,
                'query.interval': tree_query.interval,
                'query.accessions': tree_query.accessions,
                status: 'Collating data...'
            }).save((save_err: any) => {
                if (save_err) {
                    return res.status(500).send('Tree creation failed');
                }
                generate_tree(tsi_location, tree_query, db_query);
            });
            res.json(phylo_tree);
        } else {
            // Retrieved previously generated tree
            res.json(result);
        }
    });
});

function create_rapidnj_tree(db_query: TreeDatabaseQuery, phylip_file: string) {
    const rapidnj = spawn('rapidnj', ['-i', 'pd', phylip_file]);

    const stdout_close$ = fromEvent(rapidnj.stdout, 'close').pipe(take(1));
    const stderr_close$ = fromEvent(rapidnj.stderr, 'close').pipe(take(1));

    const progress$ = fromEvent(rapidnj.stderr, 'data').pipe(
        takeUntil(stderr_close$),
        throttleTime(500),
        map(data => {
            const status_updates = data.toString().trim().split(' ');
            const percentage = status_updates[status_updates.length - 1].trim();
            return percentage;
        }),
        map(percentage => `Building tree: ${percentage}`),
        map(status_update => ({ status: status_update }))
    );

    const result$ = fromEvent(rapidnj.stdout, 'data').pipe(
        takeUntil(stdout_close$),
        reduce((newick_output, chunk) => newick_output + chunk, ''),
        map(newick_output => ({
            status: 'ready',
            tree_newick: newick_output
        }))
    );

    merge(progress$, result$).pipe(
        concatMap(update => PheneticTree.updateOne(db_query, update))
    ).subscribe(() => {});
}

/**
 * Save list of accessions into a temporary file and return the file name.
 */
async function write_accessions(accessions: string[]): Promise<string> {
    const output_file = fileSync();
    await promisify(fs.writeFile)(output_file.name, accessions.join('\n') + '\n');
    return output_file.name;
}

function generate_tree(tsi_location: string, tree_query: TreeQuery,
                       db_query: TreeDatabaseQuery) {
    const partitions = partitionQuery(tsi_location, config['index_partitions'],
                                      tree_query);

    const db_files = partitions.indexed.map(async interval => {
        const region = formatRegion(tree_query.chromosome_name, interval.start,
                                    interval.end);
        const result = await DBMatrix.findOne(
            { dataset_id: db_query.dataset_id, region: region },
            { _id: 0, matrix_file: 1 }
        );
        return result['matrix_file'];
    });

    const tersect_output_files = partitions.nonindexed.map(async interval => {
        const output_file = fileSync();
        const region = formatRegion(tree_query.chromosome_name, interval.start,
                                    interval.end);
        const command = `tersect dist ${tsi_location} ${region} > ${output_file.name}`;
        const result = await execPromise(command);
        // TODO: error handling on tersect result / promise rejection
        return output_file.name;
    });

    const positive_matrix_files = [];
    const negative_matrix_files = [];

    partitions.indexed.forEach((interval, i) => {
        if (interval.type === 'add') {
            positive_matrix_files.push(db_files[i]);
        } else if (interval.type === 'subtract') {
            negative_matrix_files.push(db_files[i]);
        }
    });
    partitions.nonindexed.forEach((interval, i) => {
        if (interval.type === 'add') {
            positive_matrix_files.push(tersect_output_files[i]);
        } else if (interval.type === 'subtract') {
            negative_matrix_files.push(tersect_output_files[i]);
        }
    });

    const input_files = [
        write_accessions(tree_query.accessions),
        ...positive_matrix_files,
        ...negative_matrix_files
    ];

    Promise.all(input_files).then(([acc_file, ...matrix_files]) => {
        const positive = matrix_files.slice(0, positive_matrix_files.length)
                                     .join(' ');
        const negative = matrix_files.slice(positive_matrix_files.length,
                                            matrix_files.length).join(' ');
        const script = path.join(__dirname, 'merge_phylip.py');
        let merge_command: string;
        if (negative.length) {
            merge_command = `${script} ${tsi_location} ${positive} -n ${negative} -a ${acc_file}`;
        } else {
            merge_command = `${script} ${tsi_location} ${positive} -a ${acc_file}`;
        }
        return execPromise(merge_command);
    }).then((output_filename: string) => {
        create_rapidnj_tree(db_query, output_filename.trim());
    });
}

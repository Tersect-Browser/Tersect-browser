import * as fs from 'fs';
import * as path from 'path';

import { Router } from 'express';
import { exec, spawn } from 'child_process';

import { DBMatrix } from './db/dbmatrix';
import { ChromosomeIndex } from './db/chromosomeindex';
import { ViewSettings } from './db/viewsettings';

import { default as Hashids } from 'hashids';
import { isNullOrUndefined } from 'util';
import { Dataset, IDataset, IDatasetPublic } from './db/dataset';
import { newickToTree } from '../app/clustering/clustering';
import { PhyloTree, IPhyloTree } from './db/phylotree';
import { TreeQuery } from '../app/models/TreeQuery';
import { fileSync, } from 'tmp';
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

function init_distance_matrix(sample_num: number) {
    const output = { matrix: Array(sample_num), samples: [] };
    for (let i = 0; i < output.matrix.length; i++) {
        output.matrix[i] = Array(sample_num).fill(0);
    }
    return output;
}

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

router.route('/query/:dataset_id/dist/:accession/:chromosome/:start/:stop/:binsize')
      .get((req, res) => {
    const accession = req.params.accession;
    const chromosome = req.params.chromosome;
    const start_pos = parseInt(req.params.start, 10);
    const stop_pos = parseInt(req.params.stop, 10);
    const binsize = parseInt(req.params.binsize, 10);
    const options = {
        maxBuffer: 200 * 1024 * 1024 // 200 megabytes
    };

    const tsi_location = res.locals.dataset.tsi_location;

    const region = `${chromosome}:${start_pos}-${stop_pos}`;
    const tersect_command = `tersect dist -j ${tsi_location} -a "${accession}" \
${region} -B ${binsize}`;

    const output = {
        reference: accession,
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

router.route('/datasets')
      .get((req, res) => {
    Dataset.find().exec((err, r: IDataset[]) => {
        if (err || isNullOrUndefined(r)) {
            res.json(undefined);
        } else {
            const output: IDatasetPublic[] = r.map((dataset) => {
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
    exported_view.save((err) => {
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
    const tree_query: TreeQuery = req.body;
    const db_query = {
        dataset_id: req.params.dataset_id,
        'query.chromosome_name': tree_query.chromosome_name,
        'query.interval': tree_query.interval,
        'query.accessions': tree_query.accessions
    };
    PhyloTree.findOne(db_query)
             .exec((err, result: IPhyloTree) => {
        if (err) {
            res.json(err);
        } else if (isNullOrUndefined(result)) {
            // Generating new tree
            generate_tree(req, res);
        } else {
            // Retrieved previously generated tree
            res.json(result.tree);
        }
    });
});

function create_rapidnj_tree(req, res, phylip_file) {
    const rapidnj = spawn('rapidnj', ['-i', 'pd', phylip_file]);
    rapidnj.stderr.on('data', (data) => {
        // Progress percentages
        // console.log(data.toString().trim());
    });
    let newick_output = '';
    rapidnj.stdout.on('data', (data) => {
        newick_output += data.toString();
    });
    rapidnj.stdout.on('close', () => {
        res.json(newickToTree(newick_output));
    });
}

function generate_tree(req, res) {
    const tsi_location = res.locals.dataset.tsi_location;
    const tree_query: TreeQuery = req.body;

    const partitions = partitionQuery(tsi_location, config['index_partitions'],
                                      tree_query);

    const db_files = partitions.indexed.map(async interval => {
        const region = `${tree_query.chromosome_name}:${interval.start}-${interval.end}`;
        const result = await DBMatrix.findOne(
            { region: region }, { _id: 0, matrix_file: 1 }
        );
        return result['matrix_file'];
    });

    const tersect_output_files = partitions.nonindexed.map(async interval => {
        const output_file = fileSync();
        const region = `${tree_query.chromosome_name}:${interval.start}-${interval.end}`;
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

    const matrix_files = positive_matrix_files.concat(negative_matrix_files);

    Promise.all(matrix_files).then((results) => {
        const positive = results.slice(0, positive_matrix_files.length)
                                .join(' ');
        const negative = results.slice(positive_matrix_files.length,
                                       results.length).join(' ');
        const accessions = tree_query.accessions.join(' ');
        const script = path.join(__dirname, 'merge_phylip.py');
        let merge_command: string;
        if (negative.length) {
            merge_command = `${script} ${tsi_location} ${positive} -n ${negative} -a ${accessions}`;
        } else {
            merge_command = `${script} ${tsi_location} ${positive} -a ${accessions}`;
        }
        return execPromise(merge_command);
    }).then((output_filename: string) => {
        create_rapidnj_tree(req, res, output_filename.trim());
    });
}

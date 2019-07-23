import * as fs from 'fs';
import * as path from 'path';
import * as csvparse from 'csv-parse';

import { Router } from 'express';
import { exec, execSync, spawn } from 'child_process';

import { DBMatrix } from './db/dbmatrix';
import { ChromosomeIndex } from './db/chromosomeindex';
import { ViewSettings } from './db/viewsettings';

import { default as Hashids } from 'hashids';
import { isNullOrUndefined } from 'util';
import { Dataset, IDataset, IDatasetPublic } from './db/dataset';
import { buildNJTree, newickToTree } from '../app/clustering/clustering';
import { PhyloTree, IPhyloTree } from './db/phylotree';
import { TreeQuery } from '../app/models/TreeQuery';
import { DistanceMatrix } from '../app/models/DistanceMatrix';
import { formatRegion } from '../app/utils/utils';
import { fileSync, FileResult } from 'tmp';

export const router = Router();

function loadConfig() {
    const contents = fs.readFileSync(path.join(__dirname, 'config.json'));
    return JSON.parse(contents.toString());
}

const config = loadConfig();

interface ChromosomePartitions {
    [chromosome_names: string]: number[];
}

function loadChromosomePartitions(tsi_location: string): ChromosomePartitions {
    const output = {};
    const command = `tersect chroms -n ${tsi_location}`;

    execSync(command).toString().trim().split('\n').forEach(line => {
        const cols = line.split('\t');
        const partitions = [ parseInt(cols[1], 10) ];
        // Include only partitions smaller than the chromosome size
        partitions.push(...config['index_partitions'].filter(x => {
             return x < partitions[0];
        }));
        output[cols[0]] = partitions;
    });

    return output;
}

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
            resolve(JSON.parse(stdout.trim()));
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

interface Interval {
    start: number;
    end: number;
    type?: 'add' | 'subtract';
}

/**
 * Interval partitioned into (indexed, i.e. pre-computed) intervals to be taken
 * from the database and nonindexed intervals to be fetched from Tersect.
 */
interface IntervalPartitions {
    indexed: Interval[];
    nonindexed: Interval[];
}

function _partitionInterval(input: Interval,
                            part_size: number): IntervalPartitions {
    const intervals: IntervalPartitions = { indexed: [], nonindexed: []};
    for (let i = Math.round(input.start / part_size) * part_size;
             i < Math.round(input.end / part_size) * part_size;
             i += part_size) {
        intervals.indexed.push({
            start: i + 1,
            end: i + part_size,
            type: input.type === 'subtract' ? 'subtract' : 'add'
        });
    }
    if (intervals.indexed.length === 0) {
        intervals.nonindexed.push({
            start: input.start,
            end: input.end,
            type: input.type === 'subtract' ? 'subtract' : 'add'
        });
        return intervals;
    }
    if (input.start < intervals.indexed[0].start) {
        intervals.nonindexed.push({
            start: input.start,
            end: intervals.indexed[0].start - 1,
            type: input.type === 'subtract' ? 'subtract' : 'add'
        });
    } else if (input.start > intervals.indexed[0].start) {
        intervals.nonindexed.push({
            start: intervals.indexed[0].start,
            end: input.start - 1,
            // Reversing type
            type: input.type === 'subtract' ? 'add' : 'subtract'
        });
    }
    if (input.end > intervals.indexed[intervals.indexed.length - 1].end) {
        intervals.nonindexed.push({
            start: intervals.indexed[intervals.indexed.length - 1].end + 1,
            end: input.end,
            type: input.type === 'subtract' ? 'subtract' : 'add'
        });
    } else if (input.end < intervals.indexed[intervals.indexed.length - 1].end) {
        intervals.nonindexed.push({
            start: input.end + 1,
            end: intervals.indexed[intervals.indexed.length - 1].end,
            // Reversing type
            type: input.type === 'subtract' ? 'add' : 'subtract'
        });
    }
    return intervals;
}

function partitionInterval(input: Interval,
                           partition_sizes: number[]): IntervalPartitions {
    partition_sizes = [...partition_sizes]; // cloning
    partition_sizes.sort((a, b) => a - b); // Ascending order
    let part_size = partition_sizes.pop();
    const intervals = _partitionInterval(input, part_size);
    while (partition_sizes.length) {
        part_size = partition_sizes.pop();
        const new_indexed: Interval[] = [];
        const new_nonindexed: Interval[] = [];
        intervals.nonindexed.forEach((inter) => {
            const new_inter = _partitionInterval(inter, part_size);
            new_indexed.push(...new_inter.indexed);
            new_nonindexed.push(...new_inter.nonindexed);
        });
        intervals.indexed.push(...new_indexed);
        intervals.nonindexed = new_nonindexed;
    }
    return intervals;
}

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

async function prepare_distance_matrix(tsi_location: string,
                                       chromosome: string,
                                       start_pos: number,
                                       end_pos: number): Promise<any> {
    const options = {
        maxBuffer: 100 * 1024 * 1024 // 100 megabytes
    };

    // TODO: check if calling this each time affects performance
    const chromosome_partitions = loadChromosomePartitions(tsi_location);

    const partitions = partitionInterval({
        start: start_pos, end: end_pos
    }, chromosome_partitions[chromosome]);

    // Skip partitions which lie entirely outiside the chromosome
    partitions.indexed = partitions.indexed.filter(
        p => p.start <= chromosome_partitions[chromosome][0]
    );
    partitions.nonindexed = partitions.nonindexed.filter(
        p => p.start <= chromosome_partitions[chromosome][0]
    );

    const tersect_calls = partitions.nonindexed.map(interval => {
        const region = `${chromosome}:${interval.start}-${interval.end}`;
        const command = `tersect dist -j ${tsi_location} ${region}`;
        return execPromise(command, options);
    });

    const index_calls = partitions.indexed.map(interval => {
        const region = `${chromosome}:${interval.start}-${interval.end}`;
        return DBMatrix.findOne({ region: region }).exec();
    });

    const all_promises = tersect_calls.concat(index_calls);

    const all_types = partitions.nonindexed.map(x => x.type).concat(
                      partitions.indexed.map(x => x.type));

    const results = await Promise.all(all_promises);
    return new Promise((resolve, reject) => {
        // The field containing sample names is called 'rows' in tersect
        // results but 'samples' in the MongoDB collection.
        // Using whichever is in the first result.
        const sample_field_name = tersect_calls.length ? 'rows' : 'samples';
        let output: {
            matrix: number[][];
            samples: string[];
            region?: string;
        };
        const sample_num = results[0][sample_field_name].length;
        output = init_distance_matrix(sample_num);
        output.samples = results[0][sample_field_name];
        output.region = `${chromosome}:${start_pos}-${end_pos}`;
        // Adding up results
        for (let i = 0; i < all_promises.length; i++) {
            results[i]['matrix'].forEach((row, row_idx) => {
                row.forEach((col, col_idx) => {
                    if (all_types[i] === 'subtract') {
                        output.matrix[row_idx][col_idx] -= col;
                    } else {
                        output.matrix[row_idx][col_idx] += col;
                    }
                });
            });
        }
        resolve(output);
    });
}

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

function generate_tree(req, res) {
    const tsi_location = res.locals.dataset.tsi_location;
    const tree_query: TreeQuery = req.body;
    prepare_distance_matrix(tsi_location,
                            tree_query.chromosome_name,
                            tree_query.interval[0],
                            tree_query.interval[1])
                            .then((matrix: DistanceMatrix) => {
        const tree = buildNJTree(matrix, tree_query.accessions);
        new PhyloTree({
            dataset_id: req.params.dataset_id,
            query: tree_query,
            tree: tree
        }).save((err) => {
            if (err) {
                res.json(err);
            } else {
                res.json(tree);
            }
        });
    });
}

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

function create_tree(req, res, phylip_file) {
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

interface PhylipData {
    accessions: string[];
    distances: number[][];
    indices?: number[];
}

function readPhylip(filename: string,
                    accessions: string[], parser): Promise<PhylipData> {
    return new Promise<PhylipData>(resolve => {
        const found_distances = [];
        const found_indices = [];
        const found_accessions = [];
        let line = 0;
        const parse_stream = fs.createReadStream(filename).pipe(parser);
        parse_stream.on('data', (row: string[]) => {
            if (accessions.includes(row[0])) {
                found_distances.push(row.slice(1));
                found_accessions.push(row[0]);
                found_indices.push(line);
            }
            line += 1;
        });
        return parse_stream.on('end', () => {
            found_accessions.forEach((acc, i) => {
                found_distances[i] = found_indices.map(
                    index => parseInt(found_distances[i][index], 10)
                );
            });
            resolve({
                accessions: found_accessions,
                distances: found_distances,
                indices: found_indices
            });
        });
    });
}

function combine_files(files: string[], accessions: string[]): FileResult {
    const parser = csvparse({ delimiter: ' ', from_line: 2 });
    const combined_file = fileSync();

    readPhylip(files[0], accessions, parser).then((pd: PhylipData) => {

        const output_stream = fs.createWriteStream(combined_file.name,
                                                   { flags: 'a' });
        output_stream.write(pd.accessions.length.toString() + '\n');
        pd.accessions.forEach((acc, i) => {
            output_stream.write(acc + ' ');
            output_stream.write(pd.distances[i].join(' ') + '\n');
        });
        output_stream.end();

    });

    console.log(combined_file.name);

    return combined_file;
}

router.route('/query/:dataset_id/rtree')
      .post((req, res) => {
    const tsi_location = res.locals.dataset.tsi_location;
    const tree_query: TreeQuery = req.body;
    const region = formatRegion(tree_query.chromosome_name,
                                tree_query.interval[0],
                                tree_query.interval[1]);
    const tersect_output = fileSync();
    const tersect_command = `tersect dist ${tsi_location} ${region} > ${tersect_output.name}`;
    execSync(tersect_command);
    const combined_file = combine_files([tersect_output.name],
                                        tree_query.accessions);
    create_tree(req, res, combined_file.name);
});

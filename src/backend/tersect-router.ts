import * as fs from 'fs';
import * as path from 'path';

import { Router } from 'express';
import { exec, execSync } from 'child_process';

import { DBMatrix } from './db/dbmatrix';

export const router = Router();

function loadConfig() {
    const contents = fs.readFileSync(path.join(__dirname, 'config.json'));
    return JSON.parse(contents.toString());
}

const config = loadConfig();

interface ChromosomePartitions {
    [chromosome_names: string]: number[];
}

function loadChromosomePartitions(): ChromosomePartitions {
    const output = {};
    const command = `tersect chroms -n ${config.tsi_location}`;

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
const chromosome_partitions = loadChromosomePartitions();

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

const zip = rows => rows[0].map((_, c) => rows.map(row => row[c]));

function build_command(accession: string, chromosome: string,
                       start_pos: number, end_pos: number) {
    const tersect_command = `tersect dist -j ${config.tsi_location} \
-a "${accession}" "${chromosome}:${start_pos}-${end_pos}"`;
    return tersect_command;
}

// CORS middleware
router.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    next();
});

router.route('/samples')
      .get((req, res) => {
    const tersect_command = `tersect samples -n ${config.tsi_location}`;
    exec(tersect_command, (err, stdout, stderr) => {
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

router.route('/dist/:accession/:chromosome/:start/:stop/:binsize')
      .get((req, res) => {
    const startpos = parseInt(req.params.start, 10);
    const stoppos = parseInt(req.params.stop, 10);
    const binsize = parseInt(req.params.binsize, 10);

    const all_promises = [];

    let pos: number;
    for (pos = startpos; pos < stoppos - binsize; pos += binsize) {
        all_promises.push(execPromise(build_command(req.params.accession,
                                                    req.params.chromosome,
                                                    pos, pos + binsize)));
    }
    all_promises.push(execPromise(build_command(req.params.accession,
                                                req.params.chromosome,
                                                pos, stoppos)));
    const dist = {};
    Promise.all(all_promises).then((bin_results) => {
        const accessions = bin_results[0]['columns'];
        zip(bin_results.map(x => x['matrix'][0])).forEach((m, i) => {
            dist[accessions[i]] = m;
        });
        res.json(dist);
    });
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

router.route('/distall/:chromosome/:start/:stop')
      .get((req, res) => {
    const chromosome = req.params.chromosome;
    const start_pos = parseInt(req.params.start, 10);
    const stop_pos = parseInt(req.params.stop, 10);
    const options = {
        maxBuffer: 100 * 1024 * 1024 // 100 megabytes
    };

    const partitions = partitionInterval({
        start: start_pos, end: stop_pos
    }, chromosome_partitions[chromosome]);

    const tersect_calls = partitions.nonindexed.map(interval => {
        const command = `tersect dist -j ${config.tsi_location} \
"${chromosome}:${interval.start}-${interval.end}"`;
        return execPromise(command, options);
    });

    const index_calls = partitions.indexed.map(interval => {
        const region = `${chromosome}:${interval.start}-${interval.end}`;
        return DBMatrix.findOne({ command: region }).exec();
    });

    const all_promises = tersect_calls.concat(index_calls);

    Promise.all(all_promises).then((results) => {
        let output: { matrix: number[][]; samples: string[]; };
        if (tersect_calls.length) {
            const sample_num = results[0]['rows'].length;
            output = init_distance_matrix(sample_num);
            output.samples = results[0]['rows'];
        } else if (index_calls.length) {
            // No tersect calls, initializing based on index calls
            const sample_num = results[0]['tersect_output']['samples'].length;
            output = init_distance_matrix(sample_num);
            output.samples = results[0]['tersect_output']['samples'];
        } else {
            // No calls at all, this shouldn't happen
            res.json(output);
            return;
        }
        // Adding up index call results
        for (let i = 0; i < tersect_calls.length; i++) {
            const type = partitions.nonindexed[i].type;
            results[i]['matrix'].forEach((row, row_idx) => {
                row.forEach((col, col_idx) => {
                    if (type === 'subtract') {
                        output.matrix[row_idx][col_idx] -= col;
                    } else {
                        output.matrix[row_idx][col_idx] += col;
                    }
                });
            });
        }
        // Adding up index call results
        for (let i = 0; i < index_calls.length; i++) {
            const type = partitions.indexed[i].type;
            results[tersect_calls.length + i]
                   ['tersect_output']['matrix'].forEach((row, row_idx) => {
                row.forEach((col, col_idx) => {
                    if (type === 'subtract') {
                        output.matrix[row_idx][col_idx] -= col;
                    } else {
                        output.matrix[row_idx][col_idx] += col;
                    }
                });
            });
        }
        res.json(output);
    });
});

router.route('/distances/:accession/:chromosome/:start/:stop/:binsize')
      .get((req, res) => {
    const options = {
        cwd: config.tsi_location,
        maxBuffer: 100 * 1024 * 1024 // 100 megabytes
    };

    const tersect_command = `tersect dist ${req.params.accession} \
${req.params.chromosome} \
${req.params.start} ${req.params.stop} \
${req.params.binsize}`;

    exec(tersect_command,
         options, (err, stdout, stderr) => {
        if (err) {
            res.json(err);
        }
        res.json(JSON.parse(stdout));
    });
});

router.route('/matrix/:chromosome/:start/:stop')
      .get((req, res) => {
    const options = {
        cwd: config.tsi_location,
        maxBuffer: 100 * 1024 * 1024 // 100 megabytes
    };

    const tersect_command = `tersect matrix ${req.params.chromosome} \
${req.params.start} ${req.params.stop}`;
    console.log(tersect_command);
    // Matrix is fetched from database if possible, requested from tersect
    // otherwise
    DBMatrix.findOne({ command: tersect_command }).exec((db_err, result) => {
        if (db_err) { res.send(db_err); }
        if (result !== null) {
            res.json(result.get('tersect_output'));
        } else {
            exec(tersect_command, options, (err, stdout, stderr) => {
                if (err) {
                    res.json(err);
                } else if (stderr) {
                    res.json(stderr);
                } else {
                    const tersect_output = JSON.parse(stdout);
                    const stored_matrix = new DBMatrix({
                        command: tersect_command,
                        tersect_output: tersect_output
                    });
                    stored_matrix.save();
                    res.json(tersect_output);
                }
           });
        }
    });
});

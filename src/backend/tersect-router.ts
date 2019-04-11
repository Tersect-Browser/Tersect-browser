import { Router } from 'express';
import { exec } from 'child_process';

// declare var RapidNeighborJoining: any;

import { DBMatrix } from './db/dbmatrix';

export const router = Router();

const tersect_db_location = '/home/tom/genome_version_control/tersect2/test/dbs/tomato_fd_hom_snps.tsi';

function execPromise(command) {
    return new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
            if (error) {
                reject(error);
                return;
            }
            resolve(JSON.parse(stdout.trim()));
        });
    });
}

const zip = rows => rows[0].map((_, c) => rows.map(row => row[c]));

function build_command(accession: string, chromosome: string,
                       start_pos: number, end_pos: number) {
    const tersect_command = `tersect dist -j ${tersect_db_location} \
-a ${accession} ${chromosome}:${start_pos}-${end_pos}`;
    console.log(tersect_command);
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
    const tersect_command = `tersect samples -n ${tersect_db_location}`;
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

router.route('/distances/:accession/:chromosome/:start/:stop/:binsize')
      .get((req, res) => {
    const options = {
        cwd: tersect_db_location,
        maxBuffer: 100 * 1024 * 1024 // 100 megabytes
    };

    const tersect_command = `tersect dist ${req.params.accession} \
${req.params.chromosome} \
${req.params.start} ${req.params.stop} \
${req.params.binsize}`;
    console.log(tersect_command);

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
        cwd: tersect_db_location,
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

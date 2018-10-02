import { Router } from 'express';
import { exec } from 'child_process';
// declare var RapidNeighborJoining: any;

import nj = require('neighbor-joining');

export const router = Router();

const tersect_db_location = '/home/tom/genome_version_control/tersect2/test/full/';

// CORS middleware
router.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    next();
});

router.route('/distances/:accession/:chromosome/:start/:stop/:binsize')
      .get((req, res) => {
    const options = {
        cwd: tersect_db_location,
        maxBuffer: 100 * 1024 * 1024 // 50 megabytes
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
        maxBuffer: 100 * 1024 * 1024 // 50 megabytes
    };

    const tersect_command = `tersect matrix ${req.params.chromosome} \
${req.params.start} ${req.params.stop}`;
    console.log(tersect_command);

    exec(tersect_command,
         options, (err, stdout, stderr) => {
        if (err) {
            res.json(err);
        }
        // res.json(JSON.parse(stdout));
        const output = JSON.parse(stdout);
        const accessions = output.samples.map((x) => {
            return { name: x };
        });
        const RNJ = new nj.RapidNeighborJoining(output.matrix, accessions);
        RNJ.run();
        res.json(RNJ.getAsNewick());
    });

    /*const D = [
        [0,  5,  9,  9, 8],
        [5,  0, 10, 10, 9],
        [9, 10,  0,  8, 7],
        [9, 10,  8,  0, 3],
        [8,  9,  7,  3, 0]
    ];
    const names = ['A', 'B', 'C', 'D', 'F'];
    const taxa = names.map((x) => {
        return { name: x };
    });
    const RNJ = new nj.RapidNeighborJoining(D, taxa);
    RNJ.run();
    // res.json(RNJ.getAsObject());
    res.json(RNJ.getAsNewick());*/
});

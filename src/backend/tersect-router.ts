import { Router } from 'express';
import { exec } from 'child_process';

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
        maxBuffer: 20 * 1024 * 1024 // 20 megabytes
    };

    exec(`tersect dist ${req.params.accession} ${req.params.chromosome} \
${req.params.start} ${req.params.stop} \
${req.params.binsize}`,
         options, (err, stdout, stderr) => {
        if (err) {
            res.json(err);
        }
        res.json(JSON.parse(stdout));
    });
});

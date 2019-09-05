import { Router } from 'express';
import { GeneTGRC } from './db/genetgrc';

export const router = Router();

// CORS middleware
router.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    next();
});

router.route('/genes')
      .get((req, res) => {
    GeneTGRC.find({}).exec((err, result: GeneTGRC) => {
        if (err) {
            return res.status(500).send('Genes could not be retrieved');
        } else {
            return res.json(result);
        }
    });
});

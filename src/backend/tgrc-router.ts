import { Router } from 'express';

import { isNullOrUndefined } from '../app/utils/utils';
import { AccessionTGRC } from './models/accessiontgrc';
import { GeneTGRC } from './models/genetgrc';

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

router.route('/accessions/:gene?/:filter?')
      .get((req, res) => {
    const gene = req.params.gene;
    const filter = isNullOrUndefined(req.params.filter) ? false
                                                        : req.params.filter;
    const query = isNullOrUndefined(gene) ? {}
                                          : { 'alleles.gene': gene };
    const projection = { _id: 0, accession: 1, alleles: 1};
    AccessionTGRC.find(AccessionTGRC.translateAliases(query),
                       AccessionTGRC.translateAliases(projection))
                 .exec((err, result: AccessionTGRC[]) => {
        if (err) {
            return res.status(500).send('Accessions could not be retrieved');
        } else {
            const output = result.map(acc => {
                const accObj = acc.toObject();
                return {
                    accession: accObj.accession,
                    alleles: accObj.alleles
                };
            });
            if (filter) {
                // Exclude other genes from result
                output.forEach(acc => {
                    acc.alleles = acc.alleles.filter(a => a.gene === gene);
                });
            }
            return res.json(output);
        }
    });
});

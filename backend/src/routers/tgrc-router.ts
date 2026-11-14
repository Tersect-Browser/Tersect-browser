import { Router } from 'express';

import { AccessionTGRC } from '../models/accessiontgrc';
import { GeneTGRC } from '../models/genetgrc';

export const router = Router();

// CORS middleware
router.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    next();
});

router.route('/genes')
      .get(async (req, res) => {
    try {
        const result = await GeneTGRC.find({}).exec();
        return res.json(result);
    } catch (err) {
        return res.status(500).send('Genes could not be retrieved');
    }
});

router.route('/accessions/:gene?/:filter?')
      .get(async (req, res) => {
    const gene = req.params.gene;
    const filter = req.params.filter || false;
    const query = gene ? { 'alleles.gene': gene } : {};
    const projection = { _id: 0, accession: 1, alleles: 1};
    try {
        const result = await AccessionTGRC.find(
            AccessionTGRC.translateAliases(query),
            AccessionTGRC.translateAliases(projection)
        ).exec();
        const output = result.map(acc => {
            const accObj = acc.toObject<Pick<AccessionTGRC, 'accession' | 'alleles'>>();
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
    } catch (err) {
        return res.status(500).send('Accessions could not be retrieved');
    }
});

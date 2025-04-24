import {
    exec,
    spawn,
    execFile
} from 'child_process';
import {
    Request,
    Response,
    Router
} from 'express';
import * as fs from 'fs';
import {
    default as Hashids
} from 'hashids';
import * as path from 'path';
import {
    fromEvent,
    merge
} from 'rxjs';
import {
    concatMap,
    map,
    reduce,
    take,
    takeUntil,
    throttleTime
} from 'rxjs/operators';
import {
    fileSync
} from 'tmp';
import {
    promisify
} from 'util';

import {
    DistanceBinQuery,
    DistanceBins
} from '../../../common/DistanceBins';
import {
    TreeDatabaseQuery,
    TreeQuery
} from '../../../common/PheneticTree';

import { tbConfig } from '../load-config';
import { ChromosomeIndex } from '../models/chromosomeindex';
import { Dataset, DatasetPublic } from '../models/dataset';
import { DBMatrix } from '../models/dbmatrix';
import { NewickTree } from '../models/newicktree';
import { ViewSettings } from '../models/viewsettings';
import { partitionQuery } from '../utils/partitioning';
import { formatRegion } from '../utils/utils';

const util = require('util');

const readdir = util.promisify(fs.readdir);
const stat = util.promisify(fs.stat);
const access = util.promisify(fs.access);

// Recursive function to find the file by name
async function findFileRecursive(dir, targetFileName) {
    console.log(dir, targetFileName);
    
    let entries;
    try {
        entries = await readdir(dir);
    } catch (err) {
        return null; // Can't read directory
    }

    for (const entry of entries) {
        const fullPath = path.join(dir, entry);
        let stats;
        try {
            stats = await stat(fullPath);
        } catch (err) {
            continue; // Skip unreadable entries
        }

        if (stats.isDirectory()) {
            const found = await findFileRecursive(fullPath, targetFileName);
            if (found) return found;
        } else if (entry === targetFileName) {
            return fullPath;
        }
    }

    return null;
}

export const router = Router();

/**
 * Save list of accessions into a temporary file and return the file name.
 */
async function writeAccessions(accessions: string[]): Promise<string> {
    try {
        const outputFile = fileSync();
    await promisify(fs.writeFile)(outputFile.name, accessions.join('\n') + '\n');
    return outputFile.name;
    } catch (error) {
        console.log('Error writing accessions to file');
        console.log(error);
        
    }
    
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

router.use('/query/:datasetId', (req, res, next) => {
    Dataset.findOne({ _id: req.params.datasetId })
           .exec((err, dataset: Dataset) => {
        if (err) {
            res.send(err);
            return;
        } else if (!dataset) {
            res.status(404).send('Dataset not found');
            return;
        } else {
            res.locals.dataset = dataset;
            return next();
        }
    });
})




    router.use('/datafiles/:filename', async (req, res) => {
        const localDbLocation = tbConfig.localDbPath;
        const fileName = req.params.filename;
        const searchRoot = path.join(localDbLocation, 'gp_data_copy');
    
        try {
            console.log('lorem ran the route at least');
            
            const foundFilePath = await findFileRecursive(searchRoot, fileName);
    
            if (!foundFilePath) {
                return res.status(404).send('File not found');
            }
            res.type('application/octet-stream'); // Or whatever the actual file type is

            await access(foundFilePath, fs.constants.R_OK);
   
            res.sendFile(foundFilePath, (err) => {
                if (err) {
                    if (err.message === 'EACCES') {
                        return res.status(403).send('Permission denied while sending file');
                    } else {
                        console.error('Error sending file:', err);
                        res.status(500).send('Internal Server Error');
                    }
                }
            });
    
        } catch (err) {
            if (err.code === 'EACCES') {
                return res.status(403).send('Permission denied while accessing file');
            } else {
                console.error('Unexpected error during file search:', err);
                res.status(500).send('Internal Server Error');
            }
        }
    });

router.route('/query/:datasetId/samples')
      .get((req, res) => {
    const options = {
        maxBuffer: 5 * 1024 * 1024 // 5 megabytes
    };
    const tsiLocation = res.locals.dataset.tsi_location;
    const tersectCommand = `tersect samples -n ${tsiLocation}`;
    exec(tersectCommand, options, (err, stdout, stderr) => {
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

router.route('/query/:datasetId/chromosomes')
      .get((req, res) => {
    ChromosomeIndex.find({
        reference: res.locals.dataset.reference
    }, {'name': 1, 'size': 1, '_id': 0}).exec((err, chroms) => {
        if (err) {
            res.send(err);
        } else if (!chroms) {
            res.status(404).send('Chromosomes not found');
        } else {
            res.json(chroms);
        }
    });
});

router.route('/query/:datasetId/gaps/:chromosome')
      .get((req, res) => {
    ChromosomeIndex.findOne({
        reference: res.locals.dataset.reference,
        name: req.params.chromosome
    }, 'gaps').exec((err, gaps) => {
        if (err) {
            res.send(err);
        } else if (!gaps) {
            res.status(404).send('Chromosome not found');
        } else {
            res.json(gaps['gaps']);
        }
    });
});

router.route('/query/:datasetId/dist')
      .post((req, res) => {
        try {
        
    const options = {
        maxBuffer: 200 * 1024 * 1024 // 200 megabytes
    };

    const tsiLocation = res.locals.dataset.tsi_location;
    const distBinQuery: DistanceBinQuery = req.body;

    const region = formatRegion(distBinQuery.chromosome_name,
                                distBinQuery.interval[0],
                                distBinQuery.interval[1]);

    const reference = distBinQuery.reference;
    const binsize = distBinQuery.binsize;
    
    writeAccessions(distBinQuery.accessions).then(accFile => {
        const tersectCommand = `tersect dist -j ${tsiLocation} \
-a "${reference}" --b-list-file ${accFile} ${region} -B ${binsize}`;

        const output: DistanceBins = {
            query: distBinQuery,
            bins: {}
        };
        try {
            exec(tersectCommand, options, (err, stdout, stderr) => {
                if (err) {
                    res.json(err);
                } else if (stderr) {
                    res.json(stderr);
                } else {
                    const tersectOutput = JSON.parse(stdout);
                    const accessions = tersectOutput['columns'];
                    accessions.forEach((accessionName: string) => {
                        output.bins[accessionName] = [];
                    });
                    tersectOutput['matrix'].forEach((binMatrix: number[][]) => {
                        binMatrix[0].forEach((dist: number, i: number) => {
                            output.bins[accessions[i]].push(dist);
                        });
                    });
                    res.json(output);
                }
            });
        } catch (error) {
            
        }
       
    });
} catch (error) {
        console.log(error);
        res.status(500).send('Error processing request');
              
}
});

router.route('/datasets')
      .get((req, res) => {
    Dataset.find().exec((err, r: Dataset[]) => {
        if (err || !r) {
            res.json(undefined);
        } else {
            const output: DatasetPublic[] = r.map(dataset => {
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
        if (err || !r) {
            res.json(undefined);
        } else {
            res.json(r['settings']);
        }
    });
});

const DEFAULT_VIEW_SALT = 'tersectsalt';
const MAX_VIEW_ID = 2000000000;

function randomHash(): string {
    const hash = new Hashids(DEFAULT_VIEW_SALT);
    return hash.encode(Math.floor(Math.random() * MAX_VIEW_ID));
}

function exportView(req: Request, res: Response) {
    const nextId = randomHash();
    // Casting to any to fix compilation bug where the settings are not
    // recognized as a known property
    // TODO: match interface to mongoose schema
    const exportedView = new ViewSettings({
        _id: nextId,
        settings: req.body
    } as any);
    exportedView.save(err => {
        if (err) {
            if (err.code === 11000) {
                // Duplicate key error, retry
                exportView(req, res);
            } else {
                res.json(err);
            }
            return;
        }
        res.json(nextId);
    });
}

router.route('/views/export')
      .post(exportView);
      

router.route('/query/:datasetId/tree')
      .post((req, res) => {
        try {
            const tsiLocation = res.locals.dataset.tsi_location;
            const treeQuery: TreeQuery = req.body;
            const dbQuery: TreeDatabaseQuery = {
                datasetId: req.params.datasetId,
                'query.chromosomeName': treeQuery.chromosomeName,
                'query.interval': treeQuery.interval,
                'query.accessions': treeQuery.accessions
            };
            NewickTree.findOne(dbQuery)
                      .exec((err, result: NewickTree) => {
                if (err) {
                    return res.status(500).send('Tree creation failed');
                } else if (!result) {
                    // Generating new tree
                    const phyloTree = new NewickTree({
                        datasetId: req.params.datasetId,
                        'query.chromosomeName': treeQuery.chromosomeName,
                        'query.interval': treeQuery.interval,
                        'query.accessions': treeQuery.accessions,
                        status: 'Collating data...'
                    }).save(saveErr => {
                        if (saveErr) {
                            return res.status(500).send('Tree creation failed');
                        }
                        generateTree(tsiLocation, treeQuery, dbQuery);
                    });
                    res.json(phyloTree);
                } else {
                    // Retrieved previously generated tree
                    res.json(result);
                }
            });
        } catch (error) {
            console.log('Error creating tree');
            console.log(error);
            res.status(500).send('Tree creation failed');
        }
        

});

router.route('/generate-barcodes').post((req, res) => {
    try{
        console.log('Barcode scripts added')
    const { accessionName, chrom, start, end, size } = req.body;

    // define path to tsi and fasta
    const tsi_file = path.join(__dirname, '../../../gp_data/SGN_aer_hom_snps.tsi');
    const fasta_file = path.join(__dirname, '../../../gp_data/SL2.50.fa');

    const args = [accessionName, chrom, start, end, size, fasta_file, tsi_file];

    const scriptPath = path.join(__dirname, '../scripts/barcode_finder.sh');

    execFile(scriptPath, args, (error, stdout, stderr) => {
        if (error) {
          console.error('Shell script error:', error);
          return res.status(500).send('Error running barcode script!');
        }
    
        const outputFile = stdout.trim();
        const filename = path.basename(outputFile); // just the filename

        console.log('outputpath', outputFile);


        
        // res.download(outputFile, filename); // send file to client
        // res.send - return json wirth downloadable url --> should be in server
        //res.status.send? --> need to put status code

        const downloadableURL = `http://127.0.0.1:4300/TersectBrowserGP/datafiles/barcodes/${filename}`

        res.json({downloadableURL})
        
      });
    } catch (error) {
        res.status(500).json(error)
    }
    
})




function createRapidnjTree(dbQuery: TreeDatabaseQuery, phylipFile: string) {
    const rapidnj = spawn('rapidnj', ['-a', 'jc', '-i', 'pd', phylipFile]);

    const stdoutClose$ = fromEvent(rapidnj.stdout, 'close').pipe(take(1));
    const stderrClose$ = fromEvent(rapidnj.stderr, 'close').pipe(take(1));

    const progress$ = fromEvent(rapidnj.stderr, 'data').pipe(
        takeUntil(stderrClose$),
        throttleTime(500),
        map(data => {
            const statusUpdates = data.toString().trim().split(' ');
            const percentage = statusUpdates[statusUpdates.length - 1].trim();
            return percentage;
        }),
        map(percentage => `Building tree: ${percentage}`),
        map(statusUpdate => ({ status: statusUpdate }))
    );

    const result$ = fromEvent(rapidnj.stdout, 'data').pipe(
        takeUntil(stdoutClose$),
        reduce((newickOutput, chunk) => newickOutput + chunk, ''),
        map(newickOutput => ({
            status: 'ready',
            tree: newickOutput
        }))
    );

    merge(progress$, result$).pipe(
        concatMap(update => NewickTree.updateOne(dbQuery, update))
    ).subscribe(() => {});
}



function generateTree(tsiLocation: string, treeQuery: TreeQuery,
                      dbQuery: TreeDatabaseQuery) {
    const partitions = partitionQuery(tsiLocation, tbConfig.indexPartitions,
                                      treeQuery);

    const dbFiles = partitions.indexed.map(async interval => {
        const region = formatRegion(treeQuery.chromosomeName, interval.start,
                                    interval.end);
        const result = await DBMatrix.findOne(
            { dataset_id: dbQuery.datasetId, region: region },
            { _id: 0, matrix_file: 1 }
        );
        return result['matrix_file'];
    });

    const tersectOutputFiles = partitions.nonindexed.map(async interval => {
        const outputFile = fileSync();
        const region = formatRegion(treeQuery.chromosomeName,
                                    interval.start, interval.end);
        const command = `tersect dist ${tsiLocation} ${region} > ${outputFile.name}`;
        const result = await execPromise(command);
        // TODO: error handling on tersect result / promise rejection
        return outputFile.name;
    });

    const positiveMatrixFiles = [];
    const negativeMatrixFiles = [];

    partitions.indexed.forEach((interval, i) => {
        if (interval.type === 'add') {
            positiveMatrixFiles.push(dbFiles[i]);
        } else if (interval.type === 'subtract') {
            negativeMatrixFiles.push(dbFiles[i]);
        }
    });
    partitions.nonindexed.forEach((interval, i) => {
        if (interval.type === 'add') {
            positiveMatrixFiles.push(tersectOutputFiles[i]);
        } else if (interval.type === 'subtract') {
            negativeMatrixFiles.push(tersectOutputFiles[i]);
        }
    });

    const inputFiles = [
        writeAccessions(treeQuery.accessions),
        ...positiveMatrixFiles,
        ...negativeMatrixFiles
    ];

    const intervalSize = treeQuery.interval[1] - treeQuery.interval[0];

    Promise.all(inputFiles).then(([accFile, ...matrixFiles]) => {
        const positive = matrixFiles.slice(0, positiveMatrixFiles.length)
                                    .join(' ');
        const negative = matrixFiles.slice(positiveMatrixFiles.length,
                                           matrixFiles.length).join(' ');
        const script = path.join(__dirname, '../scripts/merge_phylip.py');
        let mergeCommand = `${script} ${tsiLocation} ${positive} -a ${accFile} --interval-size ${intervalSize}`;
        if (negative.length) {
            mergeCommand = `${mergeCommand} -n ${negative}`;
        }
        return execPromise(mergeCommand);
    }).then((outputFilename: string) => {
        createRapidnjTree(dbQuery, outputFilename.trim());
    });
}

import { fileSync } from "tmp";
import * as path from 'path';
import { TreeDatabaseQuery, TreeQuery } from "../../../common/PheneticTree";
import { DBMatrix } from "../models/dbmatrix";
import { partitionQuery } from "../utils/partitioning";
import { execPromise, formatRegion, mapToAppPath, writeAccessions } from "../utils/utils";
import { createRapidnjTree , createRapidnjTreePromise} from "../utils/dbutils";
import { tbConfig } from "../load-config";
import * as fs from "fs";
import * as rimraf from "rimraf";
import { promisify } from "util";
import * as os from "os";

export function generateTree(tsiLocation: string, treeQuery: TreeQuery,
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
            positiveMatrixFiles.push(dbFiles[i].then(file => {
                return mapToAppPath(file);
            }));
        } else if (interval.type === 'subtract') {
            negativeMatrixFiles.push(dbFiles[i].then(file => {
                return mapToAppPath(file);
            }));
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

    const fileToCleanup = []

    return Promise.all(inputFiles).then(([accFile, ...matrixFiles]) => {
        const positive = matrixFiles.slice(0, positiveMatrixFiles.length)
            .join(' ');
        const negative = matrixFiles.slice(positiveMatrixFiles.length,
            matrixFiles.length).join(' ');
        const script = path.join(__dirname, '../scripts/merge_phylip.py');
        fileToCleanup.push(accFile);
        let mergeCommand = `${script} ${tsiLocation} ${positive} -a ${accFile} --interval-size ${intervalSize}`;
        if (negative.length) {
            mergeCommand = `${mergeCommand} -n ${negative}`;
        }
        return execPromise(mergeCommand);
    }).then((outputFilename: string) => {
        createRapidnjTree(dbQuery, outputFilename.trim());
        fileToCleanup.forEach(f => {
        fs.unlink(f, (err) => {
            if (err) {
                console.error(`Error deleting file ${f}:`, err);
            } else {
                console.log(`Deleted temporary file: ${f}`);
            }
        });
    });
    });

}

export async function generateTreeAsync(tsiLocation: string, treeQuery: TreeQuery,
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
            positiveMatrixFiles.push(dbFiles[i].then(file => {
                return mapToAppPath(file);
            }));
        } else if (interval.type === 'subtract') {
            negativeMatrixFiles.push(dbFiles[i].then(file => {
                return mapToAppPath(file);
            }));
        }
    });

    partitions.nonindexed.forEach((interval, i) => {
        if (interval.type === 'add') {
            positiveMatrixFiles.push(tersectOutputFiles[i]);
        } else if (interval.type === 'subtract') {
            negativeMatrixFiles.push(tersectOutputFiles[i]);
        }
    });
    const mkdtempP = promisify(fs.mkdtemp);
    const rimrafP = promisify(rimraf);
    const tmpBase = await mkdtempP(path.join(os.tmpdir(), "accessions"));
    const writtenAccessions = await writeAccessions(treeQuery.accessions, tmpBase);
    const resultOfNegativeMatrixFiles = await Promise.all(negativeMatrixFiles);
    const resultOfPositiveMatrixFiles = await Promise.all(positiveMatrixFiles);

    const inputFiles = [
        writtenAccessions,
        ...resultOfPositiveMatrixFiles,
        ...resultOfNegativeMatrixFiles
    ];

    const intervalSize = treeQuery.interval[1] - treeQuery.interval[0];

    console.log("inputFiles", inputFiles);
    const [accFile, ...matrixFiles] = inputFiles;
    console.log("accFile", accFile);
    const positive = matrixFiles.slice(0, positiveMatrixFiles.length)
        .join(' ');
    const negative = matrixFiles.slice(positiveMatrixFiles.length,
        matrixFiles.length).join(' ');
    const script = path.join(__dirname, '../scripts/merge_phylip.py');
    let mergeCommand = `${script} ${tsiLocation} ${positive} -a ${accFile} --interval-size ${intervalSize}`;
    if (negative.length) {
        mergeCommand = `${mergeCommand} -n ${negative}`;
    }
    const outputFilename = await execPromise(mergeCommand) as string;
    const response = await createRapidnjTreePromise(dbQuery, outputFilename?.trim());
    console.log('Generated tree:', response);
    const cleanup = async () => {
        try {
            await rimrafP(tmpBase);
        } catch (e) {
            console.error('Error cleaning up:', e);
        }
    };
    await cleanup();
    return response;
}

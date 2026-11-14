import { fileSync } from "tmp";
import * as path from 'node:path';
import { TreeDatabaseQuery, TreeQuery } from "../../../common/PheneticTree";
import { DBMatrix } from "../models/dbmatrix";
import { partitionQuery } from "../utils/partitioning";
import { formatRegion, mapToAppPath, runCommand, runCommandToFile, writeAccessions } from "../utils/utils";
import { createRapidnjTree , createRapidnjTreePromise} from "../utils/dbutils";
import { tbConfig } from "../load-config";
import * as fs from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import * as os from "node:os";

/**
 * Delete temporary files, including the outputs of any tersect runs that
 * completed. Stored (indexed) matrices are never passed here.
 */
async function removeFiles(files: string[],
                           pending: Promise<string>[] = []): Promise<void> {
    const settled = await Promise.allSettled(pending);
    const produced = settled.flatMap(result =>
        result.status === 'fulfilled' ? [result.value] : []);
    await Promise.all([...files, ...produced].map(file =>
        fs.promises.unlink(file).catch(() => {})));
}

/**
 * Combine distance matrices for the selected accessions; resolves with the
 * path of the merged matrix.
 */
function mergePhylip(tsiLocation: string, positive: string[],
                     negative: string[], accessionFile: string,
                     intervalSize: number): Promise<string> {
    const script = path.join(__dirname, '../scripts/merge_phylip.py');
    const args = [tsiLocation, ...positive, '-a', accessionFile,
                  '--interval-size', String(intervalSize)];
    if (negative.length) {
        args.push('-n', ...negative);
    }
    return runCommand(script, args);
}

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
        await runCommandToFile('tersect', ['dist', tsiLocation, region],
                               outputFile.name);
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

    const fileToCleanup: string[] = [];

    return Promise.all(inputFiles).then(([accFile, ...matrixFiles]) => {
        const positive = matrixFiles.slice(0, positiveMatrixFiles.length);
        const negative = matrixFiles.slice(positiveMatrixFiles.length);
        fileToCleanup.push(accFile);
        return mergePhylip(tsiLocation, positive, negative, accFile,
                           intervalSize);
    }).then((outputFilename: string) => {
        createRapidnjTree(dbQuery, outputFilename.trim());
    }).finally(() => removeFiles(fileToCleanup, tersectOutputFiles));

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
        await runCommandToFile('tersect', ['dist', tsiLocation, region],
                               outputFile.name);
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
    const tmpBase = await mkdtemp(path.join(os.tmpdir(), "accessions"));
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
    const positive = matrixFiles.slice(0, positiveMatrixFiles.length);
    const negative = matrixFiles.slice(positiveMatrixFiles.length);
    const merged: string[] = [];
    try {
        const outputFilename = (await mergePhylip(tsiLocation, positive,
                                                  negative, accFile,
                                                  intervalSize)).trim();
        merged.push(outputFilename);
        return await createRapidnjTreePromise(dbQuery, outputFilename);
    } finally {
        await rm(tmpBase, { recursive: true, force: true }).catch(() => {});
        await removeFiles(merged, tersectOutputFiles);
    }
}

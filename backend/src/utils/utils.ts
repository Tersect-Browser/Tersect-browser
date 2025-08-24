
import {
    exec,
    spawn,
} from 'child_process';
import * as path from 'path';
import { fileSync } from 'tmp';
import { promisify } from 'util';
import * as mkdirp from 'mkdirp';
import * as fs from 'fs';
import { createHash, randomBytes } from 'crypto';

export const mkdirpP = promisify(mkdirp);
export const renameP = promisify(fs.rename);
export const copyFileP = promisify(fs.copyFile); // Node 8.5+
export const unlinkP = promisify(fs.unlink);
/**
 * Formats a region string as used by samtools, Tersect, and tabix.
 */
export function formatRegion(chromosomeName: string,
                             startPos: number, endPos: number): string {
    return `${chromosomeName}:${startPos}-${endPos}`;
}


export function execPromise(command: string, options = {}) {
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

export function mapToAppPath(inputPath: string): string {
  const marker = '/distmats/';
  const idx = inputPath.indexOf(marker);
  if (idx === -1) {
    throw new Error(`Cannot find "${marker}" in input path "${inputPath}"`);
  }

  // everything from "/distmats/..." onwards
  const tail = inputPath.slice(idx);

  // prepend the fixed container root + db-data path
  return path.posix.normalize(path.posix.join(
    '/app/db-data/mongo-data',
    tail
  ));
}

const unlinkAsync = promisify(fs.unlink);

export async function deleteFile(filePath: string): Promise<void> {
  try {
    await unlinkAsync(filePath);
    console.log(`Deleted: ${filePath}`);
  } catch (error) {
    // if the file is already gone, don't treat it as an error
    if (error.code !== "ENOENT") {
      console.error(`Error deleting file ${filePath}:`, error);
      throw error;
    }
  }
}

export async function writeAccessions(accessions: string[], tempDir?: string): Promise<string> {
    try {
        const tmpDir = tempDir ? tempDir : path.join(__dirname, '../tmp');
        fs.mkdirSync(tmpDir, { recursive: true });
          const outputFile = fileSync({
            dir: tmpDir,
            keep: false
        });
        await promisify(fs.writeFile)(outputFile.name, accessions.join('\n') + '\n');
        return outputFile.name;
    } catch (error) {
        console.log('Error writing accessions to file');
        console.log(error);

    }

}

// lib/species-utils.ts


export function accessionsKey(list: string[]) {
  const s = list.slice().sort().join(',');
  return createHash('sha1').update(s).digest('hex').slice(0, 12);
}

export function sanitizeTreeStr(s: string) {
  const result =  s
    .replace(/[-+]?\d*\.?\d+e[-+]?\d+/gi, (m) =>
      Number(m).toFixed(9).replace(/0+$/, '').replace(/\.$/, '')
    )
    .replace(/([,(])\s*([^:,()]+)\s*(?=[:),])/g, (_m, pre, label) =>
      `${pre}${String(label).replace(/^'+|'+$/g, '').replace(/[^\w.\-]/g, '_')}`
    );
    return result;
}

export async function execFileLogged(cmd: string, args: string[], cwd: string) {
    return new Promise<void>((resolve, reject) => {
        const child = spawn(cmd, args, { cwd });
        child.stdout.on("data", (d) => process.stdout.write(d));
        child.stderr.on("data", (d) => process.stderr.write(d));
        child.on("error", reject);
        child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
    });
}

export function randomId(n = 16) { return randomBytes(n).toString('hex'); }

export async function moveFile(src: string, dst: string) {
  try {
    await renameP(src, dst);            // fast when same device
  } catch (e) {
    // cross-device rename fallback: copy then unlink
    await copyFileP(src, dst);
    await unlinkP(src);
  }
}
export async function runPhylonetAnalysis(params: {
    tmpBase: string;
    treeDirectory: string;
    phyloTextPath: string;
    phyloPlotPath: string;
    phyloIntroPlotPath: string;
    speciesTreePath: string;
    maxReticulations: number;
}) {
    const { tmpBase, treeDirectory, phyloTextPath, phyloPlotPath, phyloIntroPlotPath, speciesTreePath, maxReticulations } = params;
    await execFileLogged(
        "micromamba",
        [
            "run",
            "-n",
            "tersect",
            "python",
            "-u",
            path.resolve("src/scripts/phylo_scan.py"),
            "--tree-directory",
            treeDirectory,
            "--max-reticulations",
            String(maxReticulations),
            "--output-directory",
            treeDirectory,
            "--species-tree-path",
            speciesTreePath,
            "--phylotxt",
            phyloTextPath,
            "--phylo-plot",
            phyloPlotPath,
            "--phylo-intro-plot",
            phyloIntroPlotPath,
        ],
        tmpBase);
}
;
export async function runIntrogressionAnalysis(params: {
    windowsCsvPath: string;
    speciesTreePath: string;
    mu: any;
    ne: any;
    blockSize: any;
    outgroup: any;
    jsonPath: string;
    tmpBase: string;
    accessions: string[];
}) {
    const { windowsCsvPath, speciesTreePath, mu, ne, blockSize, outgroup, jsonPath, tmpBase, accessions } = params;
    const trio = accessions.filter(x => x !== outgroup); // exclude outgroup

    if (trio.length !== 3) {
        throw new Error(`--ingroup needs exactly 3 taxa; got ${trio.length}. Choose the trio explicitly.`);
    }

    await execFileLogged("micromamba", [
        "run", "-n", "tersect", "python", "-u",
        path.resolve("src/scripts/introgression_scan3.py"),
        "--windows-csv", windowsCsvPath,
        "--species-tree", speciesTreePath,
        "--block-size", String(blockSize),
        "--outgroup", outgroup,
        "--ingroup", ...trio, // <-- pass exactly 3 ingroup taxa
        "--alpha", "0.05",
        "--out-json", jsonPath,
    ], tmpBase);
}


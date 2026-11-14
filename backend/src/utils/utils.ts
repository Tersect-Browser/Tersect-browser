
import {
    exec,
    spawn,
} from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { tbConfig } from '../load-config';

/** Analysis scripts shipped with the backend. */
const SCRIPTS_DIR = path.join(__dirname, '..', 'scripts');

/**
 * Python used for the introgression scripts, which need the "tersect" conda
 * environment (environment.yml). Override with TB_ANALYSIS_PYTHON, e.g.
 * "conda run -n tersect python" or a path to that environment's python.
 */
function analysisPython(): [string, string[]] {
    const [command, ...args] = (process.env.TB_ANALYSIS_PYTHON
        ?? 'micromamba run -n tersect python').split(/\s+/);
    return [command, args];
}

/**
 * Data files are recorded with the path they were created at. When the
 * database is used from another place (e.g. inside a container), look for
 * them under this setup's localDbPath instead.
 */
export function resolveTsiPath(storedPath: string): string {
    if (fs.existsSync(storedPath)) {
        return storedPath;
    }
    return path.join(tbConfig.localDbPath, path.basename(storedPath));
}

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

/**
 * Location of a stored distance matrix. Matrices are recorded with the path
 * they were written to; when that path does not exist (the database was
 * built outside the container it is now used in), the matrix is looked for
 * under the container's data directory instead.
 */
export function mapToAppPath(inputPath: string): string {
  if (fs.existsSync(inputPath)) {
    return inputPath;
  }
  const marker = '/distmats/';
  const idx = inputPath.indexOf(marker);
  if (idx === -1) {
    throw new Error(`Cannot find "${marker}" in input path "${inputPath}"`);
  }

  // everything from "/distmats/..." onwards
  const tail = inputPath.slice(idx);

  return path.join(tbConfig.localDbPath, tail);
}

export async function deleteFile(filePath: string): Promise<void> {
  try {
    await fsp.unlink(filePath);
    console.log(`Deleted: ${filePath}`);
  } catch (error) {
    // if the file is already gone, don't treat it as an error
    if (error.code !== "ENOENT") {
      console.error(`Error deleting file ${filePath}:`, error);
      throw error;
    }
  }
}

/**
 * Write a list of accessions, one per line, to a new file and return its
 * path. The caller is responsible for deleting it.
 */
export async function writeAccessions(accessions: string[], tempDir?: string): Promise<string> {
    const dir = tempDir ?? path.join(os.tmpdir(), 'tersect-accessions');
    await fsp.mkdir(dir, { recursive: true });
    const file = path.join(dir, `accessions-${randomId(8)}.txt`);
    await fsp.writeFile(file, accessions.join('\n') + '\n');
    return file;
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
    await fsp.rename(src, dst);         // fast when same device
  } catch (e) {
    // cross-device rename fallback: copy then unlink
    await fsp.copyFile(src, dst);
    await fsp.unlink(src);
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
    const [python, pythonArgs] = analysisPython();
    await execFileLogged(
        python,
        [
            ...pythonArgs,
            "-u",
            path.join(SCRIPTS_DIR, "phylo_scan.py"),
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
    const [python, pythonArgs] = analysisPython();
    await execFileLogged(python, [
        ...pythonArgs, "-u",
        path.join(SCRIPTS_DIR, "introgression_scan.py"),
        "--windows-csv", windowsCsvPath,
        "--species-tree", speciesTreePath,
        "--block-size", String(blockSize),
        "--outgroup", outgroup,
        "--ingroup", ...trio, // <-- pass exactly 3 ingroup taxa
        "--alpha", "0.05",
        "--out-json", jsonPath,
    ], tmpBase);
}


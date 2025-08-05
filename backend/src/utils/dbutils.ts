import { TreeDatabaseQuery } from '../../../common/PheneticTree';
import { ChromosomeIndex } from '../models/chromosomeindex';
import { NewickTree } from '../models/newicktree';
import {
    concatMap,
    map,
    reduce,
    take,
    takeUntil,
    throttleTime,
    withLatestFrom,
    shareReplay
} from 'rxjs/operators';
import { fromEvent, merge, of, throwError,  } from 'rxjs';
import {
    spawn, ChildProcess
} from 'child_process';

import * as os from 'os';
import * as path from 'path';
import { generateTree, generateTreeAsync } from '../controllers/generateTree';
import SpeciesTreeCache from '../models/SpeciesTreeCache';
import { mkdirpP, writeFileP, readFileP, rimrafP } from '../routers/introgression-router';
import { publishSSE } from '../routers/sse';
import { accessionsKey, sanitizeTreeStr, execFileLogged } from './utils';

export async function cleanDatabase() {
    // Clean up unfinished trees.
    await NewickTree.deleteMany({ 'status': { $ne: 'ready' }}, err => {
        if (err) {
            console.log(err);
            process.exit(0);
        }
    }).then(out => {
        if (out.deletedCount) {
            console.log(`Removed ${out.deletedCount} incomplete tree(s).`);
        }
    });
}

export async function fetchChromosomes(reference: string): Promise<Array<{ name: string; size: number }>> {
  return ChromosomeIndex
    .find({ reference }, { name: 1, size: 1, _id: 0 })
    .lean()
    .exec();
}

export function createRapidnjTree(dbQuery: TreeDatabaseQuery, phylipFile: string) {
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
    ).subscribe(() => { });
}

/**
 * Run rapidnj for a PHYLIP file and resolve with the final Newick tree.
 * - No progress updates are returned.
 * - Writes the final result to Mongo once (status:'ready', tree).
 * - Rejects if the process exits non-zero or errors.
 *
 * RxJS 6.4: returns a Promise via .toPromise()
 */

type RapidNJResult = { status: 'ready'; tree: string };

export function createRapidnjTreePromise(
  dbQuery: TreeDatabaseQuery,
  phylipFile: string,
  opts?: { timeoutMs?: number; sanitize?: (s: string) => string }
): Promise<RapidNJResult> {
  const timeoutMs = (opts && opts.timeoutMs) || 15 * 60 * 1000; // default 15 min
  const sanitize = (opts && opts.sanitize) || ((s: string) => s);

  return new Promise<RapidNJResult>((resolve, reject) => {
    let stdoutBuf = '';
    let stderrBytes = 0;
    let settled = false;
    let timer: NodeJS.Timer | null = null;

    const rapidnj: ChildProcess = spawn('rapidnj', ['-a', 'jc', '-i', 'pd', phylipFile], {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    // Helper to finish exactly once
    const finish = (err?: Error, treeText?: string) => {
      if (settled) return;
      settled = true;

      // Cleanup listeners & timer
      try {
        if (timer) { clearTimeout(timer); }
        rapidnj.stdout && rapidnj.stdout.removeAllListeners();
        rapidnj.stderr && rapidnj.stderr.removeAllListeners();
        rapidnj.removeAllListeners();
      } catch { /* ignore */ }

      if (err) {
        // Best-effort status update, then reject
        NewickTree.updateOne(dbQuery, { status: 'error' }).exec()
          .then(() => reject(err), () => reject(err));
      } else {
        const res: RapidNJResult = { status: 'ready', tree: treeText || '' };
        // Save final result, then resolve regardless of write outcome
        NewickTree.updateOne(dbQuery, res).exec()
          .then(() => resolve(res), () => resolve(res));
      }
    };

    // Handle spawn errors (e.g., binary not found)
    rapidnj.on('error', (e: any) => {
      finish(new Error(`failed to spawn rapidnj: ${e && e.message ? e.message : String(e)}`));
    });

    // Collect stdout (tree)
    if (rapidnj.stdout) {
      rapidnj.stdout.setEncoding('utf8');
      rapidnj.stdout.on('data', (chunk: string) => { stdoutBuf += chunk; });
      // drain end event; not strictly required for finish logic, but harmless
      rapidnj.stdout.on('end', () => { /* noop */ });
    }

    // Drain stderr so the child never blocks, but we don’t parse it
    if (rapidnj.stderr) {
      rapidnj.stderr.on('data', (chunk: Buffer | string) => {
        // Counting bytes helps debugging if needed
        const len = Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk as string);
        stderrBytes += len;
      });
      rapidnj.stderr.on('end', () => { /* noop */ });
    }

    // Exit handler: check code
    rapidnj.on('close', (code: number | null, signal: string | null) => {
      if (code === 0) {
        const tree = sanitize(stdoutBuf);
        finish(undefined, tree);
      } else {
        const msg = `rapidnj exited with code ${code}${signal ? ` (signal ${signal})` : ''}`;
        finish(new Error(msg));
      }
    });

    // Optional timeout: kill and reject
    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        try { rapidnj.kill('SIGKILL'); } catch { /* ignore */ }
        finish(new Error(`rapidnj timed out after ${timeoutMs} ms (stderr=${stderrBytes} bytes)`));
      }, timeoutMs);
    }
  });
}
export async function ensureBuildSpeciesTree(opts: {
    datasetId: string;
    dataset: any;
    accessions: string[];
    astralCmd?: string[]; // e.g. ['astral'] or ['java','-Xmx8g','-jar','/path/astral.jar']
}) {
    const { datasetId, dataset, accessions } = opts;
    const accKey = accessionsKey(accessions);
    const keyForSSE = `${datasetId}::${accKey}`;

    // Already ready? Nothing to do.
    const existing: any = await SpeciesTreeCache.findOne({
        datasetId, accessionsKey: accKey, kind: 'astral', status: 'ready'
    }).lean().exec();
    if (existing && existing.tree) {
        publishSSE(keyForSSE, 'ready', { datasetId, accKey, ok: true });
        return;
    }

    // Acquire build lock or detect an active build
    const now = new Date();
    const staleMs = 30 * 60 * 1000;
    const doc = false;

    // Kick off the build without blocking this call

        const tmpRoot = path.join(os.tmpdir(), 'species-build', String(datasetId), accKey);
        const allChrTreesPath = path.join(tmpRoot, 'all_chr_trees.tre');
        const astralTreePath = path.join(tmpRoot, 'species_tree_astral.tre');

        try {
            await mkdirpP(tmpRoot);

            const reference = dataset.reference;
            const chroms = await fetchChromosomes(reference);
            const total = chroms.length;
            let done = 0;
            const lines: string[] = [];

            for (const { name, size } of chroms) {
                // Per‑chromosome tree
                const q: any = {
                    datasetId,
                    'query.chromosomeName': name,
                    'query.interval': [0, size],
                    'query.accessions': accessions
                };

                let rec: any = await NewickTree.findOne(q).lean().exec();
                let immediateTree;
                if (!rec) {
                    immediateTree = await generateTreeAsync(
                        '/app/gp_data_copy/SGN_aer_hom_snps.tsi',
                        { chromosomeName: name, interval: [0, size], accessions },
                        q
                    );
                    lines.push(sanitizeTreeStr(immediateTree.tree).trim());
                    console.log('passed here', immediateTree.tree);
                    done += 1;
                    publishSSE(keyForSSE, 'progress', { datasetId, accKey, stage: 'per-chrom', done, total });
                }else{
                if (rec && rec.tree) lines.push(sanitizeTreeStr(rec.tree).trim());
                done += 1;
                publishSSE(keyForSSE, 'progress', { datasetId, accKey, stage: 'per-chrom', done, total });
                }


            }

            if (!lines.length) throw new Error('No per‑chromosome trees available');

            await writeFileP(allChrTreesPath, lines.join('\n') + '\n', 'utf8');

            const cmd = (opts.astralCmd && opts.astralCmd.length)
                ? { bin: opts.astralCmd[0], args: opts.astralCmd.slice(1) }
                : { bin: 'astral', args: [] };

            const args = cmd.args.concat(['-i', allChrTreesPath, '-o', astralTreePath]);
            publishSSE(keyForSSE, 'progress', { datasetId, accKey, stage: 'astral', message: 'running' });
            await execFileLogged(cmd.bin, args, tmpRoot);

            const newick = (await readFileP(astralTreePath, 'utf8')).trim();

            await SpeciesTreeCache.updateOne(
                { datasetId, accessionsKey: accKey, kind: 'astral' },
                { $set: { status: 'ready', tree: newick, error: null, updatedAt: new Date() } },
                { upsert: true }
            ).exec();

            publishSSE(keyForSSE, 'ready', { datasetId, accKey, ok: true });

        } catch (err) {
            await SpeciesTreeCache.updateOne(
                { datasetId, accessionsKey: accKey, kind: 'astral' },
                { $set: { status: 'error', error: String(err), updatedAt: new Date() } }
            ).exec();
            publishSSE(keyForSSE, 'error', { datasetId, accKey, error: String(err) });
        } finally {
            await rimrafP(tmpRoot); // best‑effort cleanup
        }
    ;


}

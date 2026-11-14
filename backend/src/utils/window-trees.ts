/**
 * Gene trees for consecutive windows of a chromosome, computed from the
 * variant store (ClickHouse) instead of one tersect + rapidNJ run per window.
 *
 * Distances match `tersect dist` on the dataset's index: a variant counts
 * towards a pair when exactly one of the two accessions carries it, using
 * the variants the index was built from (the dataset's `tersect` rules), and
 * windows are inclusive at both ends like tersect regions. Counts are then
 * Jukes-Cantor corrected over the window length, as merge_phylip.py does, and
 * trees are built by neighbour joining.
 */
import { queryVariantStore } from './variant-store';

export interface DistanceRules {
    homozygous: boolean;
    types: 'snps' | 'indels' | 'both';
}

export interface WindowTree {
    start: number;
    end: number;
    newick: string;
}

const TYPE_FILTERS = {
    snps: 'AND length(ref) = 1 AND length(alt) = 1',
    indels: 'AND NOT (length(ref) = 1 AND length(alt) = 1)',
    both: '',
};

/**
 * Differences per accession pair (i < j, row-major) for each window
 * [start + k·step, min(start + (k+1)·step, end)], in one scan.
 */
export async function windowDistanceCounts(
    dataset: string, chromosome: string, start: number, end: number,
    step: number, accessions: string[], rules: DistanceRules
): Promise<Map<number, number[]>> {
    const rows = await queryVariantStore<{ window: number; counts: number[] }>(
        `WITH {accessions:Array(String)} AS acc,
              arrayFilter(p -> p.1 < p.2, arrayFlatten(arrayMap(
                  i -> arrayMap(j -> (i, j), range(1, length(acc) + 1)),
                  range(1, length(acc) + 1)))) AS pairs
         SELECT window, sumForEach(diffs) AS counts
         FROM (
             SELECT
                 -- A variant on a window boundary also ends the window before.
                 arrayJoin(if(w > 0 AND (pos - {start:UInt32}) % {step:UInt32} = 0,
                              [w - 1, w], [w])) AS window,
                 arrayMap(p -> toUInt32(present[p.1] != present[p.2]), pairs) AS diffs
             FROM (
                 SELECT intDiv(pos - {start:UInt32}, {step:UInt32}) AS w, pos,
                        arrayMap(a -> has(arrayFilter((c, d) -> d >= {minDosage:UInt8},
                                                      carriers, dosage), a), acc) AS present
                 FROM variants
                 WHERE dataset = {dataset:String} AND chrom = {chrom:String}
                   AND pos BETWEEN {start:UInt32} AND {end:UInt32}
                   AND hasAny(carriers, acc)
                   ${TYPE_FILTERS[rules.types]}
             )
         )
         GROUP BY window`,
        { dataset, chrom: chromosome, start, end, step, accessions,
          minDosage: rules.homozygous ? 2 : 1 });
    return new Map(rows.map(r => [Number(r.window), r.counts.map(Number)]));
}

/** Jukes-Cantor distance from a difference count over `length` bases. */
function jukesCantor(count: number, length: number): number {
    return -0.75 * Math.log(1 - (4 / 3) * (count / length));
}

function formatLength(value: number): string {
    // Same precision rapidNJ prints.
    return Number(value.toPrecision(5)).toString();
}

/**
 * Neighbour-joining tree (Saitou & Nei) as unrooted Newick, with a
 * three-way split at the top like rapidNJ.
 */
export function neighbourJoining(names: string[], distances: number[][]): string {
    let nodes = names.slice();
    let d = distances.map(row => row.slice());
    while (nodes.length > 3) {
        const n = nodes.length;
        const sums = d.map(row => row.reduce((a, b) => a + b, 0));
        let bestI = 0, bestJ = 1, bestQ = Infinity;
        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                const q = (n - 2) * d[i][j] - sums[i] - sums[j];
                if (q < bestQ) {
                    bestQ = q; bestI = i; bestJ = j;
                }
            }
        }
        const dij = d[bestI][bestJ];
        const li = dij / 2 + (sums[bestI] - sums[bestJ]) / (2 * (n - 2));
        const lj = dij - li;
        const joined = `(${nodes[bestI]}:${formatLength(li)},${nodes[bestJ]}:${formatLength(lj)})`;
        const keep = [...Array(n).keys()].filter(k => k !== bestI && k !== bestJ);
        const newRow = keep.map(k => (d[bestI][k] + d[bestJ][k] - dij) / 2);
        d = keep.map((k, a) => [...keep.map(m => d[k][m]), newRow[a]]);
        d.push([...newRow, 0]);
        nodes = [...keep.map(k => nodes[k]), joined];
    }
    if (nodes.length === 1) {
        return `${nodes[0]};`;
    }
    if (nodes.length === 2) {
        return `(${nodes[0]}:${formatLength(d[0][1] / 2)},${nodes[1]}:${formatLength(d[0][1] / 2)});`;
    }
    const [a, b, c] = [0, 1, 2];
    const la = (d[a][b] + d[a][c] - d[b][c]) / 2;
    const lb = d[a][b] - la;
    const lc = d[a][c] - la;
    return `(${nodes[a]}:${formatLength(la)},${nodes[b]}:${formatLength(lb)},${nodes[c]}:${formatLength(lc)});`;
}

/**
 * For four accessions, whether the window's differences support one
 * topology: the pairing with the smallest four-point sum
 * d(a,b) + d(c,d) must be strictly smallest. Exact, on integer counts.
 */
function quartetResolved(counts: number[][]): boolean {
    const sums = [
        counts[0][1] + counts[2][3],
        counts[0][2] + counts[1][3],
        counts[0][3] + counts[1][2],
    ].sort((a, b) => a - b);
    return sums[0] < sums[1];
}

/**
 * Star tree (polytomy) for a window that supports no topology, with each
 * accession's average distance to the others as its branch length.
 */
function starTree(names: string[], distances: number[][]): string {
    const n = names.length;
    const leaves = names.map((name, i) => {
        const mean = distances[i].reduce((a, b) => a + b, 0) / (n - 1);
        return `${name}:${formatLength(mean / 2)}`;
    });
    return `(${leaves.join(',')});`;
}

/**
 * Gene trees for each window of [start, end] of the given step. With four
 * accessions (the introgression quartet), a window whose differences tie
 * between topologies gets a star tree instead of an arbitrary resolution.
 */
export async function windowTrees(
    dataset: string, chromosome: string, start: number, end: number,
    step: number, accessions: string[], rules: DistanceRules
): Promise<WindowTree[]> {
    const counts = await windowDistanceCounts(dataset, chromosome, start, end,
                                              step, accessions, rules);
    const n = accessions.length;
    const trees: WindowTree[] = [];
    for (let k = 0, s = start; s < end; k++, s += step) {
        const e = Math.min(s + step, end);
        const pairCounts = counts.get(k) ?? [];
        const matrix = accessions.map(() => new Array<number>(n).fill(0));
        const raw = accessions.map(() => new Array<number>(n).fill(0));
        let p = 0;
        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++, p++) {
                raw[i][j] = raw[j][i] = pairCounts[p] ?? 0;
                matrix[i][j] = matrix[j][i] = jukesCantor(raw[i][j], e - s);
            }
        }
        const newick = n === 4 && !quartetResolved(raw)
            ? starTree(accessions, matrix)
            : neighbourJoining(accessions, matrix);
        trees.push({ start: s, end: e, newick });
    }
    return trees;
}

/**
 * Distances from a reference accession to each accession, per bin, as
 * `tersect dist -a <reference> -B <binsize>` reports them: bin k covers
 * [start + k·binsize, start + (k+1)·binsize). Used for datasets in the
 * variant store; tersect's binned mode loses all counts after a bin whose
 * variants straddle a compressed run in its bit arrays (seen on assembly
 * gaps), while whole-region distances are unaffected.
 */
export async function binnedDistances(
    dataset: string, chromosome: string, start: number, end: number,
    binsize: number, reference: string, accessions: string[],
    rules: DistanceRules
): Promise<Record<string, number[]>> {
    const rows = await queryVariantStore<{ bin: number; counts: number[] }>(
        `SELECT intDiv(pos - {start:UInt32}, {binsize:UInt32}) AS bin,
                sumForEach(arrayMap(a -> toUInt32(has(present, a) != has(present, {reference:String})),
                                    {accessions:Array(String)})) AS counts
         FROM (
             SELECT pos, arrayFilter((c, d) -> d >= {minDosage:UInt8}, carriers, dosage) AS present
             FROM variants
             WHERE dataset = {dataset:String} AND chrom = {chrom:String}
               AND pos BETWEEN {start:UInt32} AND {end:UInt32}
               AND hasAny(carriers, arrayPushBack({accessions:Array(String)}, {reference:String}))
               ${TYPE_FILTERS[rules.types]}
         )
         GROUP BY bin`,
        { dataset, chrom: chromosome, start, end, binsize, reference, accessions,
          minDosage: rules.homozygous ? 2 : 1 });
    const nbins = Math.ceil((end - start + 1) / binsize);
    const bins: Record<string, number[]> = {};
    accessions.forEach(accession => { bins[accession] = new Array<number>(nbins).fill(0); });
    for (const row of rows) {
        const bin = Number(row.bin);
        accessions.forEach((accession, i) => { bins[accession][bin] = Number(row.counts[i]); });
    }
    return bins;
}

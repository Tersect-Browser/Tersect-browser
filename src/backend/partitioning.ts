/**
 * Functions used to partition a query into intervals for which distance
 * matrices can be retrieved from the database and intervals for which new
 * matrices have to be generated using Tersect.
 */

import { execSync } from 'child_process';

import { TreeQuery } from '../app/models/TreeQuery';

interface ChromosomePartitions {
    [chromosomeNames: string]: number[];
}

interface Interval {
    start: number;
    end: number;
    type?: 'add' | 'subtract';
}

/**
 * Interval partitioned into (indexed, i.e. pre-computed) intervals to be taken
 * from the database and nonindexed intervals to be fetched from Tersect.
 */
interface IntervalPartitions {
    indexed: Interval[];
    nonindexed: Interval[];
}

export function partitionQuery(tsiLocation: string,
                               indexPartitions: number[],
                               query: TreeQuery): IntervalPartitions {
    // TODO: check if calling this each time affects performance
    const chromosomePartitions = loadChromosomePartitions(tsiLocation,
                                                           indexPartitions);

    const partitions = partitionInterval({
        start: query.interval[0], end: query.interval[1]
    }, chromosomePartitions[query.chromosomeName]);

    // Skip partitions which lie entirely outiside the chromosome
    partitions.indexed = partitions.indexed.filter(
        p => p.start <= chromosomePartitions[query.chromosomeName][0]
    );
    partitions.nonindexed = partitions.nonindexed.filter(
        p => p.start <= chromosomePartitions[query.chromosomeName][0]
    );

    return partitions;
}

function loadChromosomePartitions(tsiLocation: string,
                                  indexPartitions: number[]): ChromosomePartitions {
    const output = {};
    const command = `tersect chroms -n ${tsiLocation}`;

    execSync(command).toString().trim().split('\n').forEach(line => {
        const cols = line.split('\t');
        const partitions = [ parseInt(cols[1], 10) ];
        // Include only partitions smaller than the chromosome size
        partitions.push(...indexPartitions.filter(x => {
             return x < partitions[0];
        }));
        output[cols[0]] = partitions;
    });

    return output;
}

function partitionInterval(input: Interval,
                           partitionSizes: number[]): IntervalPartitions {
    partitionSizes = [...partitionSizes]; // cloning
    partitionSizes.sort((a, b) => a - b); // Ascending order
    let partSize = partitionSizes.pop();
    const intervals = _partitionInterval(input, partSize);
    while (partitionSizes.length) {
        partSize = partitionSizes.pop();
        const newIndexed: Interval[] = [];
        const newNonindexed: Interval[] = [];
        intervals.nonindexed.forEach(inter => {
            const newInter = _partitionInterval(inter, partSize);
            newIndexed.push(...newInter.indexed);
            newNonindexed.push(...newInter.nonindexed);
        });
        intervals.indexed.push(...newIndexed);
        intervals.nonindexed = newNonindexed;
    }
    return intervals;
}

function _partitionInterval(input: Interval,
                            partSize: number): IntervalPartitions {
    const intervals: IntervalPartitions = { indexed: [], nonindexed: []};
    for (let i = Math.round(input.start / partSize) * partSize;
             i < Math.round(input.end / partSize) * partSize;
             i += partSize) {
        intervals.indexed.push({
            start: i + 1,
            end: i + partSize,
            type: input.type === 'subtract' ? 'subtract' : 'add'
        });
    }
    if (intervals.indexed.length === 0) {
        intervals.nonindexed.push({
            start: input.start,
            end: input.end,
            type: input.type === 'subtract' ? 'subtract' : 'add'
        });
        return intervals;
    }
    if (input.start < intervals.indexed[0].start) {
        intervals.nonindexed.push({
            start: input.start,
            end: intervals.indexed[0].start - 1,
            type: input.type === 'subtract' ? 'subtract' : 'add'
        });
    } else if (input.start > intervals.indexed[0].start) {
        intervals.nonindexed.push({
            start: intervals.indexed[0].start,
            end: input.start - 1,
            // Reversing type
            type: input.type === 'subtract' ? 'add' : 'subtract'
        });
    }
    if (input.end > intervals.indexed[intervals.indexed.length - 1].end) {
        intervals.nonindexed.push({
            start: intervals.indexed[intervals.indexed.length - 1].end + 1,
            end: input.end,
            type: input.type === 'subtract' ? 'subtract' : 'add'
        });
    } else if (input.end < intervals.indexed[intervals.indexed.length - 1].end) {
        intervals.nonindexed.push({
            start: input.end + 1,
            end: intervals.indexed[intervals.indexed.length - 1].end,
            // Reversing type
            type: input.type === 'subtract' ? 'add' : 'subtract'
        });
    }
    return intervals;
}

/**
 * Functions used to partition a query into intervals for which distance
 * matrices can be retrieved from the database and intervals for which new
 * matrices have to be generated using Tersect.
 */

import { execSync } from 'child_process';
import { TreeQuery } from '../app/models/TreeQuery';

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

interface ChromosomePartitions {
    [chromosome_names: string]: number[];
}

function loadChromosomePartitions(tsi_location: string,
                                  index_partitions: number[]): ChromosomePartitions {
    const output = {};
    const command = `tersect chroms -n ${tsi_location}`;

    execSync(command).toString().trim().split('\n').forEach(line => {
        const cols = line.split('\t');
        const partitions = [ parseInt(cols[1], 10) ];
        // Include only partitions smaller than the chromosome size
        partitions.push(...index_partitions.filter(x => {
             return x < partitions[0];
        }));
        output[cols[0]] = partitions;
    });

    return output;
}

function _partitionInterval(input: Interval,
                            part_size: number): IntervalPartitions {
    const intervals: IntervalPartitions = { indexed: [], nonindexed: []};
    for (let i = Math.round(input.start / part_size) * part_size;
             i < Math.round(input.end / part_size) * part_size;
             i += part_size) {
        intervals.indexed.push({
            start: i + 1,
            end: i + part_size,
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

function partitionInterval(input: Interval,
                           partition_sizes: number[]): IntervalPartitions {
    partition_sizes = [...partition_sizes]; // cloning
    partition_sizes.sort((a, b) => a - b); // Ascending order
    let part_size = partition_sizes.pop();
    const intervals = _partitionInterval(input, part_size);
    while (partition_sizes.length) {
        part_size = partition_sizes.pop();
        const new_indexed: Interval[] = [];
        const new_nonindexed: Interval[] = [];
        intervals.nonindexed.forEach(inter => {
            const new_inter = _partitionInterval(inter, part_size);
            new_indexed.push(...new_inter.indexed);
            new_nonindexed.push(...new_inter.nonindexed);
        });
        intervals.indexed.push(...new_indexed);
        intervals.nonindexed = new_nonindexed;
    }
    return intervals;
}

export function partitionQuery(tsi_location: string,
                               index_partitions: number[],
                               query: TreeQuery): IntervalPartitions {
    // TODO: check if calling this each time affects performance
    const chromosome_partitions = loadChromosomePartitions(tsi_location,
                                                           index_partitions);

    const partitions = partitionInterval({
        start: query.interval[0], end: query.interval[1]
    }, chromosome_partitions[query.chromosome_name]);

    // Skip partitions which lie entirely outiside the chromosome
    partitions.indexed = partitions.indexed.filter(
        p => p.start <= chromosome_partitions[query.chromosome_name][0]
    );
    partitions.nonindexed = partitions.nonindexed.filter(
        p => p.start <= chromosome_partitions[query.chromosome_name][0]
    );

    return partitions;
}

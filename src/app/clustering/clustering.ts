import { DistanceMatrix } from '../models/DistanceMatrix';

export function njTreeSortAccessions(distance_matrix: DistanceMatrix): string[] {
    // return [ 'TS-93.vcf', 'TS-97.vcf' ];
    return distance_matrix.samples;
}

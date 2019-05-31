import { isNullOrUndefined } from 'util';

/**
 * Check if arrA and arrB contain the same elements
 * (possibly in a different order).
 */
export function sameElements(arrA: any[], arrB: any[]): boolean {
    if (isNullOrUndefined(arrA) || isNullOrUndefined(arrB)) { return false; }
    return arrA === arrB
           || (arrA.length === arrB.length &&
               arrA.every((element) => arrB.includes(element)));
}

/**
 * Return the smallest multiple of the second argument larger or equal to the
 * first argument, i.e. round it up to the nearest 5, 10, 50, etc.
 */
export function ceilTo(x: number, a: number): number {
    return Math.ceil(x / a) * a;
}

/**
 * Return the largest multiple of the second argument smaller or equal to the
 * first argument, i.e. round it down to the nearest 5, 10, 50, etc.
 */
export function floorTo(x: number, a: number): number {
    return Math.floor(x / a) * a;
}

/**
 * Format genomic position in terms of base pairs into a string with comma
 * separators for thousands.
 */
export function formatPosition(genome_position: number): string {
    return genome_position.toLocaleString('en');
}

/**
 * Find the closest value to x among the provided choices.
 */
export function findClosest(x: number, choices: number[]): number {
    let result = NaN;
    let min_distance = Infinity;
    choices.forEach((choice) => {
        const dist = Math.abs(x - choice);
        if (dist < min_distance) {
            min_distance = dist;
            result = choice;
        }
    });
    return result;
}

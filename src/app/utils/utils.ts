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

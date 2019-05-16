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

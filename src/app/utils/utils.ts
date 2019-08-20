import { isNullOrUndefined } from 'util';
import { ElementRef } from '@angular/core';

/**
 * Check if arrA and arrB contain the same elements
 * (possibly in a different order).
 */
export function sameElements(arrA: any[], arrB: any[]): boolean {
    if (isNullOrUndefined(arrA) || isNullOrUndefined(arrB)) { return false; }
    return arrA === arrB
           || (arrA.length === arrB.length &&
               arrA.every(element => arrB.includes(element)));
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
export function formatPosition(genome_position: number,
                               unit?: 'kbp' | 'Mbp'): string {
    const pos = Math.abs(genome_position); // preventing -0
    if (isNullOrUndefined(unit)) {
        return pos.toLocaleString('en');
    } else {
        const options = {'maximumFractionDigits': 2};
        if (unit === 'Mbp') {
            return `${(pos / 1e6).toLocaleString('en', options)} Mbp`;
        } else {
            return `${(pos / 1e3).toLocaleString('en', options)} kbp`;
        }
    }
}

/**
 * Find the closest value to x among the provided choices.
 */
export function findClosest(x: number, choices: number[]): number {
    let result = NaN;
    let min_distance = Infinity;
    choices.forEach(choice => {
        const dist = Math.abs(x - choice);
        if (dist < min_distance) {
            min_distance = dist;
            result = choice;
        }
    });
    return result;
}

/**
 * Return a list of HTML tags for an HTML element and all its ancestors.
 */
export function extractTags(element: HTMLElement): string[] {
    let node = element;
    const tags = [node.tagName];
    while (node = node.parentNode as HTMLElement) {
        if (!isNullOrUndefined(node.tagName)) {
            tags.push(node.tagName);
        } else {
            break;
        }
    }
    return tags;
}

/**
 * Sort input array according to the sort order of a second parallel array
 * as sorted by a specified comparison function (ascending order).
 * @param toSort array to be sorted based on the order of the second array.
 * @param sortBy parallel array to base the sort order on.
 * @param compFn sort comparison function to use.
 */
export function syncSort(toSort: any[], sortBy: any[],
                compFn: (a: any, b: any) => number = (a, b) => a - b): any[] {
    return toSort.map((n, i) => [n, sortBy[i]])
                 .sort((a, b) => compFn(a[1], b[1]))
                 .map(sorted => sorted[0]);
}

/**
 * Formats a region string as used by Tersect and tabix.
 */
export function formatRegion(chromosome_name: string,
                             start_pos: number, end_pos: number): string {

    return `${chromosome_name}:${start_pos}-${end_pos}`;
}

export function deepCopy(object: any): any {
    return JSON.parse(JSON.stringify(object));
}

/**
 * Check if subset array is a subset of superset array.
 */
export function isSubset(subset: any[], superset: any[]): boolean {
    return (new Set(superset.concat(subset))).size === superset.length;
}

/**
 * Merge two arrays, leaving with no duplicate elements.
 */
export function arrayUnion(a: any[], b: any[]): any[] {
    return Array.from(new Set(a.concat(b)));
}

/**
 * Remove all elements in the second array from the first array
 */
export function arraySubtract(a: any[], b: any[]): any[] {
    const set = new Set(a);
    b.forEach(x => set.delete(x));
    return Array.from(set);
}

/**
 * Extract the pixel position of a fixed position tag.
 */
export function fixedElementPosition(element: ElementRef): {x: number,
                                                            y: number} {
    const left_px = element.nativeElement.style.left;
    const top_px = element.nativeElement.style.top;
    return {
        x: parseInt(left_px.substring(0, left_px.length - 2), 10),
        y: parseInt(top_px.substring(0, top_px.length - 2), 10)
    };
}

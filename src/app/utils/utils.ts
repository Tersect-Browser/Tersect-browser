import { ElementRef } from '@angular/core';

/**
 * Remove all elements in the second array from the first array
 */
export function arraySubtract(a: any[], b: any[]): any[] {
    const set = new Set(a);
    b.forEach(x => set.delete(x));
    return Array.from(set);
}

/**
 * Merge two arrays, leaving with no duplicate elements.
 */
export function arrayUnion(a: any[], b: any[]): any[] {
    return uniqueArray(a.concat(b));
}

/**
 * Return the smallest multiple of the second argument larger or equal to the
 * first argument, i.e. round it up to the nearest 5, 10, 50, etc.
 */
export function ceilTo(x: number, a: number): number {
    return Math.ceil(x / a) * a;
}

/**
 * Clamps the provided value between min and max.
 */
export function clamp(x: number, min: number, max: number): number {
    if (x < min) {
        return min;
    } else if (x > max) {
        return max;
    } else {
        return x;
    }
}

export function deepCopy(object: any): any {
    return isNullOrUndefined(object) ? object
                                     : JSON.parse(JSON.stringify(object));
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
 * Find the closest value to x among the provided choices.
 */
export function findClosest(x: number, choices: number[]): number {
    let result = NaN;
    let minDistance = Infinity;
    choices.forEach(choice => {
        const dist = Math.abs(x - choice);
        if (dist < minDistance) {
            minDistance = dist;
            result = choice;
        }
    });
    return result;
}

/**
 * Extract the pixel position of a fixed position tag.
 */
export function fixedElementPosition(element: ElementRef): {x: number,
                                                            y: number} {
    const leftPx = element.nativeElement.style.left;
    const topPx = element.nativeElement.style.top;
    return {
        x: parseInt(leftPx.substring(0, leftPx.length - 2), 10),
        y: parseInt(topPx.substring(0, topPx.length - 2), 10)
    };
}

/**
 * Return the largest multiple of the second argument smaller or equal to the
 * first argument, i.e. round it down to the nearest 5, 10, 50, etc.
 */
export function floorTo(x: number, a: number): number {
    return Math.floor(x / a) * a;
}

/**
 * Generates a font value for HTML canvas.
 */
export function formatCanvasFont(size: number, font: string): string {
    return `${size}px ${font}`;
}

/**
 * Format genomic position in terms of base pairs into a string with comma
 * separators for thousands.
 */
export function formatPosition(genomePosition: number,
                               unit?: 'kbp' | 'Mbp'): string {
    const pos = Math.abs(genomePosition); // preventing -0
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
 * Formats a region string as used by Tersect and tabix.
 */
export function formatRegion(chromosomeName: string,
                             startPos: number, endPos: number): string {

    return `${chromosomeName}:${startPos}-${endPos}`;
}

/**
 * Replacement for util isNullOrUndefined deprecated since v4.0.0.
 */
export function isNullOrUndefined(value: any) {
    return value === null || value === undefined;
}

/**
 * Check if subset array is a subset of superset array.
 */
export function isSubset(subset: any[], superset: any[]): boolean {
    return (new Set(superset.concat(subset))).size === superset.length;
}

/**
 * Merge objects.
 * Fields in later (higher index) objects overwrite the earlier (lower index)
 * objects.
 */
export function mergeObjects(objs: any[]): any {
    const output = {};
    objs.filter(ob => !isNullOrUndefined(ob))
        .forEach(ob => {
        Object.keys(ob).forEach(key => {
            output[key] = {...output[key], ...ob[key]};
        });
    });
    return output;
}

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
 * Remove duplicate elements from array.
 */
export function uniqueArray(a: any[]): any[] {
    return Array.from(new Set(a));
}

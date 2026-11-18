import type { AccessionDictionary } from "@/lib/types"

/** Remove all elements in the second array from the first array. */
export function arraySubtract<T>(a: T[], b: T[]): T[] {
  const set = new Set(a)
  b.forEach((x) => set.delete(x))
  return Array.from(set)
}

/** Merge two arrays, leaving no duplicate elements. */
export function arrayUnion<T>(a: T[], b: T[]): T[] {
  return uniqueArray(a.concat(b))
}

export function uniqueArray<T>(a: T[]): T[] {
  return Array.from(new Set(a))
}

/** Round up to the nearest multiple of `a`. */
export function ceilTo(x: number, a: number): number {
  return Math.ceil(x / a) * a
}

/** Round down to the nearest multiple of `a`. */
export function floorTo(x: number, a: number): number {
  return Math.floor(x / a) * a
}

export function clamp(x: number, min: number, max: number): number {
  return Math.min(Math.max(x, min), max)
}

/** Find the closest value to x among the provided choices. */
export function findClosest(x: number, choices: number[]): number {
  let result = NaN
  let minDistance = Infinity
  for (const choice of choices) {
    const dist = Math.abs(x - choice)
    if (dist < minDistance) {
      minDistance = dist
      result = choice
    }
  }
  return result
}

export function formatCanvasFont(size: number, font: string): string {
  return `${size}px ${font}`
}

export function getAccessionColors(
  dictionary: AccessionDictionary | undefined,
  accession: string
): (string | null)[] {
  return dictionary?.[accession]?.colors ?? []
}

/** Label from the dictionary if available, otherwise the identifier. */
export function getAccessionLabel(
  dictionary: AccessionDictionary | undefined,
  accession: string
): string {
  return dictionary?.[accession]?.label ?? accession
}

/** Check if `subset` is a subset of `superset`. */
export function isSubset<T>(subset: T[], superset: T[]): boolean {
  const set = new Set(superset)
  return subset.every((x) => set.has(x))
}

/** Check if both arrays contain the same elements, in any order. */
export function sameElements<T>(
  a: T[] | null | undefined,
  b: T[] | null | undefined
): boolean {
  if (!a || !b) {
    return false
  }
  if (a === b) {
    return true
  }
  if (a.length !== b.length) {
    return false
  }
  const set = new Set(b)
  return a.every((x) => set.has(x))
}

/**
 * Sort `toSort` according to the ascending order of the parallel array
 * `sortBy`.
 */
export function syncSort<T>(toSort: T[], sortBy: number[]): T[] {
  return toSort
    .map((item, i) => [item, sortBy[i]] as const)
    .sort((a, b) => a[1] - b[1])
    .map(([item]) => item)
}

/** Jukes-Cantor distance from an SNV count. */
export function snvCountToJC(snvCount: number, intervalSize: number): number {
  return -0.75 * Math.log(1 - (4 / 3) * (snvCount / intervalSize))
}

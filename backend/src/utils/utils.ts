/**
 * Formats a region string as used by samtools, Tersect, and tabix.
 */
export function formatRegion(chromosomeName: string,
                             startPos: number, endPos: number): string {
    return `${chromosomeName}:${startPos}-${endPos}`;
}

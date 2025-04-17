const normalize = (value: string): string =>
    value.replace(/[^a-z0-9]/gi, "").toLowerCase();

export function findAccessionMatch(
    accession: string,
    candidates: string[]
  ): string | undefined {
    const target = normalize(accession);
    return candidates.find(c => normalize(c) === target);
  }


export function getBinIndexFromPosition(position: number, intervalStart: number, binsize: number): number {
    return Math.floor((position - intervalStart) / binsize);
}
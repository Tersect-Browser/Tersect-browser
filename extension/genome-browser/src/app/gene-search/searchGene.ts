import TrixTextSearchAdapter from '@gmod/trix';
import { fromUrl } from 'generic-filehandle2';
import tbconfig from '../../../../../tbconfig.json';


// Types
export enum ImpactLevel {
  HIGH = "HIGH",
  MODERATE = "MODERATE",
  LOW = "LOW"
}

 interface Parsed {
  samples: string[];  // one or more, trimmed, duplicates removed
  genes: string[];  // de-duplicated gene IDs (e.g. Solyc01gxxxxx.x)
}

 interface Variant {
  chr: string;
  pos: { start: number };
  ref: string;
  alt: string;
  eff: string;
  accessions: string[];
}

 interface ParsedResult {
  region: string;
  filter: string;
  count: number;
  variants: Variant[];
  totalAccessions: string[];
}

//utils

function parseDocId(id: string): Parsed {
  /* -------------------------------------------------------- samples ---- */
  /*  Capture whatever lies between
   *      ┌──────────────────────────── first “|”
   *      │              ┌───────────── look-ahead for “|EFF=”  OR end-of-string
   *  ^[^|]+\| ( [^|]*? ) (?=\|EFF=|$)
   *
   *  Examples
   *  ─────────────────────────────────────────────────────────────────────────
   *  SL2.50ch01:10897939:C:A||EFF=…      →   sampleSeg = ""      (empty)
   *  SL2.50ch01:95117896:T:G|aer         →   sampleSeg = "aer"
   */
  const segMatch = id.match(/^[^|]+\|([^|]*?)(?=\|EFF=|$)/);

  // No “|” at all?   →  no samples, no genes
  if (!segMatch) return { samples: [], genes: [] };

  const sampleSeg = segMatch[1];                    // may be empty ""

  // split on commas or any whitespace, drop empties, uniq
  const sampleSet = new Set(
    sampleSeg
      .split(/[,\s]+/)
      .map(s => s.trim())
      .filter(Boolean),
  );

  /* ---------------------------------------------------------- genes ---- */
  // Everything after the first "|EFF=" (if present)
  const effSection = id.split('|EFF=').slice(1).join('|EFF=');

  // cut into individual effect strings: "TYPE(...)", keep last ")"
  const effects = effSection.split(/,(?=EFF=)/);

  const geneRe  = /Solyc\d+g\d+\.\d+/;   // tomato gene pattern
  const geneSet = new Set<string>();

  for (const eff of effects) {
    const m = eff.match(/\(([^)]*)\)/);  // payload inside (...)
    if (!m) continue;

    for (const field of m[1].split('|')) {
      if (geneRe.test(field)) geneSet.add(field);
    }
  }

  return { samples: [...sampleSet], genes: [...geneSet] };
}


function parseSL2List(
  entries: string[],
  region: string,
  filter: string
): ParsedResult {
  // map each entry
  const variants = entries.map(parseEntry);

  // build a deduped, sorted list of all accessions across variants
  const accSet = new Set<string>();
  for (const v of variants) {
    for (const a of v.accessions) {
      accSet.add(a);
    }
  }
  const totalAccessions = Array.from(accSet).sort();

  return {
    region,
    filter,
    count: variants.length,
    variants,
    totalAccessions,
  };
}

function parseEntry(entry: string): Variant {
  /* ------------------------------------------------------------------ split */
  // Everything *before* the first “|EFF=”  ➜   coord + optional sample segment
  // Everything *after*  the first “|EFF=” ➜   effect section (may contain more “,EFF=”)
  let left   = entry;          // coord[|samples]
  let effSec = '';             // whole effect part, minus the initial “EFF=”

  const effIdx = entry.indexOf('|EFF=');
  if (effIdx !== -1) {
    left   = entry.slice(0, effIdx);           // coord|samples
    effSec = entry.slice(effIdx + 5);          // skip “|EFF=”
  }

  /* ----------------------------------------------- 1) chr, pos, ref, alt --- */
  const [coordPart, sampleSeg = ''] = left.split('|');      // sampleSeg may be “”
  const [chr, posStr, ref, alt] = coordPart.split(':');
  const pos = { start: parseInt(posStr, 10) };

  /* ----------------------------------------------- 2) accessions (samples) -- */
  //  • split on commas or whitespace
  //  • trim each
  //  • convert “.” or “ ” to “_”, strip trailing “_”
  const accessions = sampleSeg
    .split(/[,\s]+/)
    .map(a => a.trim().replace(/[ .]/g, '_').replace(/_+$/, ''))
    .filter(a => a.length > 0);

  /* ----------------------------------------------- 3) effect string --------- */
  const eff = effSec;        // already without the first “EFF=”

  return { chr, pos, ref, alt, eff, accessions };
}

async function searchByGene(term: string, chrom: string = 'SL2.50ch01') {

  const ixFile = fromUrl(`${tbconfig.serverHost}/datafiles/trix_indices/${chrom}/${chrom}.ix`)
  const ixxFile = fromUrl(`${tbconfig.serverHost}/datafiles/trix_indices/${chrom}/${chrom}.ixx`)

  const adapter = new TrixTextSearchAdapter(ixxFile, ixFile, 100)
  const results = await adapter.search(term)

  const docs =  Array.from(new Set(results.map(([, doc]) => {
    return doc
  })))
  const output = parseSL2List(docs, '', '')
  return output as any
}



// main functions
export async function searchGene(term: string, session: any, filter: ImpactLevel = ImpactLevel.HIGH, chrom: string, range: [number, number], datasetId: string) {
  const results = await searchInterval(term ,range, chrom, datasetId, filter)
  return results
}

export async function getSuggestions(term: string, chrom: string = 'SL2.50ch01') {

  const ixFile = fromUrl(`${tbconfig.serverHost}/datafiles/trix_indices/${chrom}/${chrom}.ix`)
  const ixxFile = fromUrl(`${tbconfig.serverHost}/datafiles/trix_indices/${chrom}/${chrom}.ixx`)

  const adapter = new TrixTextSearchAdapter(ixxFile, ixFile, 100)
  const results = await adapter.search(term)

  return Array.from(new Set(results.map(([, doc]) => {
    return parseDocId(doc).genes
  }).flat()))
}


async function searchInterval(term:string, interval: [number, number], chrom: string, datasetId: string, filter: ImpactLevel): Promise<string[]> {

  if(term){
    const geneResults = await searchByGene(term, chrom)
    return geneResults
  }

  const results: any = []

  try {
    const urlToUse = `${tbconfig.serverHost}/tbapi/query/${datasetId}/variants/${chrom}?start=${interval[0]}&end=${interval[1]}&filter=${filter}&term=${term}&format=json`
    const res = await fetch(urlToUse);
    const response = res.json()
    return response;

  } catch (error) {
    return results
  }
}











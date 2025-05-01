import TrixTextSearchAdapter from '@gmod/trix';
import { fromUrl, open } from 'generic-filehandle2'
import { getConf } from '@jbrowse/core/configuration'


import { Feature } from '@jbrowse/core/util'


export enum ImpactLevel {
  HIGH = "HIGH",
  MODERATE = "MODERATE",
  LOW = "LOW"
}
/**
 * A docId has this shape (no spaces):
 *   CHR:POS:REF:ALT | sample[,sample2 …] | EFF=type(…gene…) [,EFF=…]
 *
 * Examples
 * ──────────────────────────────────────────────────────────────────────────
 * SL2.50ch01:20001262:T:A|S.arc_LA2157_|EFF=STOP_LOST(HIGH|…|Solyc01g016460.2|…)
 * SL2.50ch02:147085:AT:A|S.pen_LA1272_,S.lyc_LA2706_|EFF=FRAME_SHIFT(HIGH|…)
 */
export interface Parsed {
  samples: string[];  // one or more, trimmed, duplicates removed
  genes: string[];  // de-duplicated gene IDs (e.g. Solyc01gxxxxx.x)
}

export function parseDocId(id: string): Parsed {
  console.log(id)
  /* -------------------------------------------------------- samples ---- */
  // 1) TEXT before first "|", then SAMPLE segment, then "|EFF="
  const segMatch = id.match(/^[^|]+\|([^|]+)\|EFF=/);
  if (!segMatch) return {
    samples: [],
    genes: [],
  }
  const sampleSeg = segMatch[1];

  // split on "," and/or whitespace, drop empties, uniq
  const sampleSet = new Set(
    sampleSeg
      .split(/[,\s]+/)
      .map(s => s.trim())
      .filter(Boolean),
  );

  /* ---------------------------------------------------------- genes ---- */
  // Everything after first "|EFF=" may have several ",EFF=" parts
  const effSection = id.split('|EFF=').slice(1).join('|EFF=');
  // cut into individual effect strings: "TYPE(...)", keep last ")"
  const effects = effSection.split(/,(?=EFF=)/);

  const geneRe = /Solyc\d+g\d+\.\d+/;          // tomato gene pattern
  const geneSet = new Set<string>();

  for (const eff of effects) {
    const m = eff.match(/\(([^)]*)\)/);        // payload inside (...)
    if (!m) continue;

    for (const field of m[1].split('|')) {
      if (geneRe.test(field)) geneSet.add(field);
    }
  }

  console.log(sampleSet, geneSet)

  return { samples: [...sampleSet], genes: [...geneSet] };
}

// ------------------------------------------------------------------
// 1) A function to search for a gene by name using Trix
// ------------------------------------------------------------------

export async function searchGene(term: string, session: any, filter: ImpactLevel = ImpactLevel.HIGH, chrom: string, range: [number, number], datasetId: string) {
  // const hits = await findHighImpactInGene(session, term, options, chrom)

  // Each "result" typically has refName, start, end, etc.
  // But depends on how you generated the Trix file.
  const results = await internalSearchGene(term, chrom, range, datasetId, filter)
  console.log(results);

  return results
}

export async function getSuggestions(term: string, chrom: string = 'SL2.50ch01') {

  const ixFile = fromUrl(`http://127.0.0.1:4300/TersectBrowserGP/datafiles/trix_indices/${chrom}/${chrom}.ix`)
  const ixxFile = fromUrl(`http://127.0.0.1:4300/TersectBrowserGP/datafiles/trix_indices/${chrom}/${chrom}.ixx`)

  const adapter = new TrixTextSearchAdapter(ixxFile, ixFile, 100)
  const results = await adapter.search(term)
  return Array.from(new Set(results.map(([, doc]) => {
    return parseDocId(doc).genes
  }).flat()))
}

export async function searchByGene(term: string, chrom: string = 'SL2.50ch01') {

  const ixFile = fromUrl(`http://127.0.0.1:4300/TersectBrowserGP/datafiles/trix_indices/${chrom}/${chrom}.ix`)
  const ixxFile = fromUrl(`http://127.0.0.1:4300/TersectBrowserGP/datafiles/trix_indices/${chrom}/${chrom}.ixx`)

  const adapter = new TrixTextSearchAdapter(ixxFile, ixFile, 100)
  const results = await adapter.search(term)
  const docs =  Array.from(new Set(results.map(([, doc]) => {
    return doc
  })))
  const output = parseSL2List(docs, '', '')
  return output as any
}



export const extractGeneName = (EFF: string): string | null => {
  // Regex for a Solyc tomato gene ID (adjust if you need other species)
  const geneRe = /Solyc\d+g\d+\.\d+/;

  // One variant can have several EFF=SPEC(...) blocks separated by commas.
  // Split on ',' **but** keep the parentheses together.
  const effects = EFF.split(/,(?=[A-Z_]+\()/);

  for (const eff of effects) {
    // grab everything inside the first pair of parentheses
    const m = eff.match(/\(([^)]*)\)/);
    if (!m) continue;

    // fields are pipe-separated; scan each for a gene ID
    for (const field of m[1].split('|')) {
      const gene = field.trim();
      if (geneRe.test(gene)) {
        return gene;               // return the first one we see
      }
    }
  }
  return '';                      // none found
};

async function searchInterval(term:string, interval: [number, number], chrom: string, datasetId: string, filter: ImpactLevel): Promise<string[]> {

  if(term){
    const geneResults = await searchByGene(term, chrom)
    console.log(geneResults);
    
    return geneResults
  }

  const results: any = []

  try {
    const urlToUse = `http://127.0.0.1:4300/TersectBrowserGP/tbapi/query/${datasetId}/variants/${chrom}?start=${interval[0]}&end=${interval[1]}&filter=${filter}&term=${term}&format=json`
    const res = await fetch(urlToUse);      // stream begins     // resolves only after stream closes
    const response = res.json()
    return response;

  } catch (error) {
    return results
  }
}

export function extractPosition(key: string): number | null {
  //            ── chromosome ──   position    ref   alt
  const m = /^.+?:([0-9]+):[^:]+:[^:]+$/u.exec(key);
  return m ? Number(m[1]) : null;
}




async function internalSearchGene(term: string, chrom: string, range: [number, number], datasetId: string, filter: ImpactLevel) {
  const results = await searchInterval(term ,range, chrom, datasetId, filter)
  return results
}

export interface Variant {
  chr: string;
  pos: { start: number };
  ref: string;
  alt: string;
  eff: string;
  accessions: string[];
}

export interface ParsedResult {
  region: string;
  filter: string;
  count: number;
  variants: Variant[];
  totalAccessions: string[];
}

export function parseSL2List(
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
  // split off the coordinate/ref/alt from any pipes
  const parts = entry.split('|');
  const [coordPart, ...metaParts] = parts;

  // 1) chr, pos, ref, alt
  const [chr, posStr, ref, alt] = coordPart.split(':');
  const pos = { start: parseInt(posStr, 10) };

  // 2) effect string (EFF=...) and accessions (anything else)
  let eff = '';
  const accessions: string[] = [];

  for (const p of metaParts) {
    if (p.startsWith('EFF=')) {
      // drop the "EFF=" prefix
      eff = p.substring(4);
    } else if (p.trim() !== '') {
      // one or more accession IDs, e.g. "S.lyc_LYC2910_" or "A,B,C_"
      // strip trailing underscores, split on commas, convert dots → underscores
      p
        .split(',')
        .map(a => a.replace(/_+$/, '').replace(/\./g, '_'))
        .filter(a => a.length > 0)
        .forEach(a => accessions.push(a));
    }
  }

  return { chr, pos, ref, alt, eff, accessions };
}







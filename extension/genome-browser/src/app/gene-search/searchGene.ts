import TrixTextSearchAdapter from '@gmod/trix';
import { fromUrl, open } from 'generic-filehandle2'
import { getConf } from '@jbrowse/core/configuration'
import { environment } from '../../environments/environment';


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

async function searchInterval(interval: [number, number], chrom: string, datasetId: string, filter: ImpactLevel): Promise<string[]> {

  const results: any = []

  try {
    const urlToUse = `http://127.0.0.1:4300/TersectBrowserGP/tbapi/query/${datasetId}/variants/${chrom}?start=${interval[0]}&end=${interval[1]}&filter=${filter}&format=json`
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

const parseIntervalResults = (results: string[]) => {
  const splitted = results.map(each => each.split('\t')).map(([pos, eff, accession]) => {
    console.log(accession, '<------at least');

    return {
      pos: {
        start: extractPosition(pos),
        chromPos: pos,
      },
      eff,
      accession: accession.split(' ').filter(each => each !== 'NA')
    }
  })
  return splitted.filter(each => each.accession.length > 0)
}



async function internalSearchGene(term: string, chrom: string, range: [number, number], datasetId: string, filter: ImpactLevel) {
  const results = await searchInterval(range, chrom, datasetId, filter)
  return results
}




const parseTrixSearchMeta = (meta: string) => {
  // Grab the metadata string from the result
  if (!meta) {
    console.error('No raw metadata found');
    return;
  }


  // Clean and decode the metadata string
  const cleaned = meta.replace(/^\[|\]$/g, ''); // Remove square brackets
  const parts: string[] = cleaned.split('|').map((part: string) =>
    decodeURIComponent(part.replace(/"/g, '')) // Decode URL-encoded strings and remove quotes
  );

  // Debug: Check if parts are being split correctly

  // The first part is the gene position (should be "SL2.50ch01:776048..784378")
  const genePosition = parts[0];

  // Extract the gene start position and chromosome using a regular expression
  const genePositionMatch = genePosition.match(/:(\d+)\.\.(\d+)/); // Match numbers between colon and ".."
  const geneChromMatch = genePosition.match(/^([^:]+)/)

  let startGenePosition: number | null = null;
  let endGenePosition: number | null = null;
  let geneChrom: string | null = null;

  if (genePositionMatch) {
    startGenePosition = parseInt(genePositionMatch[1], 10);
    endGenePosition = parseInt(genePositionMatch[2], 10);
  }


  if (geneChromMatch) {
    geneChrom = geneChromMatch[0];

  };
  return {
    start: startGenePosition,
    end: endGenePosition,
    chrom: geneChrom
  }
}






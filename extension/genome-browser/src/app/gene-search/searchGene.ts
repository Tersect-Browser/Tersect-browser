import TrixTextSearchAdapter  from '@gmod/trix'
import { fromUrl,open  } from 'generic-filehandle2'
import { getConf } from '@jbrowse/core/configuration'


import { Feature } from '@jbrowse/core/util'


export enum ImpactLevel {
  HIGH= "HIGH",
  MODERATE="MODERATE",
  LOW="LOW"
}

// ------------------------------------------------------------------
// 1) A function to search for a gene by name using Trix
// ------------------------------------------------------------------

export async function searchGene(term: string, session:any, options: ImpactLevel[] = [ImpactLevel.HIGH]) {
  const hits = await findHighImpactInGene(session, term, options)

  // Each "result" typically has refName, start, end, etc.
  // But depends on how you generated the Trix file.
  return hits
}

async function internalSearchGene(term: string, session:any) {
  const results = findHighImpactInGene(session, '', [ImpactLevel.HIGH])
  return results
}

// ------------------------------------------------------------------
// 2) Get all "VariantTrack" configs from the session
//    (or adapt for however your tracks are listed)
// ------------------------------------------------------------------

function getAllVcfTrackConfigs(session: any) {
  
  // This can vary by your environment.
  // For example, session might have `session.tracks` or `views[0].tracks`.
  // Here, we assume session.views[0].tracks is an array of track configs.
  const trackConfigs = session.views[0].tracks || []


  // Filter only the VCF-type tracks
  return trackConfigs.filter((t: any) => t.type === 'VariantTrack')
}

// ------------------------------------------------------------------
// 3) Fetch features from a single VCF track for a given region
// ------------------------------------------------------------------

async function fetchVariantsForRegion(
  session: any,
  trackConfig: any,
  refName: string,
  start: number,
  end: number,
) {
  // The adapter config tells JBrowse how to load data (VCF .tbi, etc.)
  const adapterConfig = getConf(trackConfig, 'adapter')


  // "CoreGetFeatures" is the built-in RPC method for fetching features

  const asyncGenerator: AsyncGenerator<Feature> = await session.rpcManager.call(
    session.id,
    'CoreGetFeatures',
    {
      sessionId: session.id,
      adapterConfig,
      regions: [{ refName, start, end }],
      rpcDriverName: 'MainThreadRpcDriver'
    },
  )

  // Collect the async generator into an array
  const features: Feature[] = []
  for await (const feature of asyncGenerator) {
    features.push(feature)
  }
  return features
}

// ------------------------------------------------------------------
// 4) Example filter for "high impact" variants
//    Adjust to match your actual VCF annotation scheme
// ------------------------------------------------------------------
function isSpecifiedImpact(feature:any, impact: ImpactLevel) {
  const info = feature.get('INFO')
  // The EFF field is typically an array of strings
  const effArray = info?.EFF
  if (!effArray) {
    return false
  }

  // Each EFF array element might look like:
  //   "UPSTREAM(HIGH|...|gene|...)"
  // or "UTR_3_PRIME(MODIFIER|...|gene|...)"
  for (const effString of effArray) {
    // Check if it says HIGH in parentheses
    if (effString.includes(impact)) {
      return true
    }
  }
  return false
}


function filterHighImpact(features: Feature[]) {
  return features.filter(f => {
    // For VCF features, the "INFO" field is often in f.get('INFO')
    // Or f.get('info'), or something similar, depending on your setup
    return isSpecifiedImpact(f, ImpactLevel.HIGH)
  })
}

function filterLowImpact(features: Feature[]) {
  return features.filter(f => {
    return isSpecifiedImpact(f, ImpactLevel.LOW)
  })
}

function filterModerateImpact(features: Feature[]) {
  return features.filter(f => {
    return isSpecifiedImpact(f, ImpactLevel.MODERATE)
  })
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


    if (geneChromMatch){
      geneChrom = geneChromMatch[0];

    };
    return {
      start: startGenePosition,
      end: endGenePosition,
      chrom: geneChrom
    }
}

// ------------------------------------------------------------------
// 5) Main function: search for gene, then fetch variants from each
//    VCF track, filter by "high impact", and return results
// ------------------------------------------------------------------

export interface GenomicInterval {
  refName: string   // e.g. “chr7”
  start: number     // 0‑based
  end: number       // half‑open
}

function jexlForImpact(levels: ImpactLevel[]): string {
  // The first EFF string looks like
  //   missense_variant(MODERATE|…)
  // so a plain substring check on the first record is
  // usually fast enough and avoids the extra split/parsing
  const tests = levels.map(
    lvl => `INFO.EFF && includes(INFO.EFF[0], '${lvl}')`,
  )
  return tests.length === 1 ? tests[0] : `(${tests.join(' || ')})`
}

async function fetchVariants(
  session: any,
  trackConfig: any,
  region: GenomicInterval,
  desiredImpacts: ImpactLevel[],
) {
  const adapterConfig = getConf(trackConfig, 'adapter')

  const asyncGen: AsyncGenerator<Feature> = await session.rpcManager.call(
    session.id,
    'CoreGetFeatures',
    {
      sessionId      : session.id,
      adapterConfig,
      regions        : [region],
      // <-- NEW in JBrowse ≥ 2.11: array of JEXL strings
      filters        : [ jexlForImpact(desiredImpacts) ],
      rpcDriverName  : 'MainThreadRpcDriver',
    },
  )

  const feats: Feature[] = []
  for await (const f of asyncGen) feats.push(f)
  return feats
}

export async function findVariantsInInterval(
  session: any,
  interval: GenomicInterval,
  impacts: ImpactLevel[] = [ImpactLevel.HIGH],
) {
  const results: any[] = []
  for (const track of getAllVcfTrackConfigs(session)) {
    const vars = await fetchVariants(session, track, interval, impacts)
    if (vars.length)
      results.push({
        trackId   : track.trackId,
        trackName : track.name,
        refName   : interval.refName,
        impact    : impacts.join(','),
        variants  : vars,
      })
  }
  return results
}

export async function findHighImpactInGene(session: any, geneName: string, options: ImpactLevel[]) {

  const results = await findVariantsInInterval(session, {
    start: 1,
    end: 13615066,
    refName: 'SL2.50ch01'
  }, [ImpactLevel.HIGH])

  console.log(results)

  return []
}

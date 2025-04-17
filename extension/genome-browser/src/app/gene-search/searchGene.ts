import TrixTextSearchAdapter  from '@gmod/trix'
import { fromUrl,open  } from 'generic-filehandle2'
import { getConf } from '@jbrowse/core/configuration'


import { Feature } from '@jbrowse/core/util'


export enum Options {
  HIGH= "HIGH",
  MODERATE="MODERATE",
  LOW="LOW"
}

// ------------------------------------------------------------------
// 1) A function to search for a gene by name using Trix
// ------------------------------------------------------------------

export async function searchGene(term: string, session:any, options: Options[] = [Options.HIGH]) {
  const hits = await findHighImpactInGene(session, term, options)

  // Each "result" typically has refName, start, end, etc.
  // But depends on how you generated the Trix file.
  return hits
}

async function internalSearchGene(term: string, session:any) {
  // Example: your Trix index files (adjust paths as needed)
  const ixFile = fromUrl('http://127.0.0.1:4300/TersectBrowserGP/datafiles/trix/SL2.50.ix')
  const ixxFile = fromUrl('http://127.0.0.1:4300/TersectBrowserGP/datafiles/trix/SL2.50.ixx')
  const metaFile = fromUrl('http://127.0.0.1:4300/TersectBrowserGP/datafiles/trix/SL2.50.meta.json')

  const adapter = new TrixTextSearchAdapter(ixxFile, ixFile, 30)
  const results = await adapter.search(term, {
    signal: new AbortController().signal,
  })

  // Each "result" typically has refName, start, end, etc.
  // But depends on how you generated the Trix file.
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
function isSpecifiedImpact(feature:any, impact: Options) {
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
    return isSpecifiedImpact(f, Options.HIGH)
  })
}

function filterLowImpact(features: Feature[]) {
  return features.filter(f => {
    return isSpecifiedImpact(f, Options.LOW)
  })
}

function filterModerateImpact(features: Feature[]) {
  return features.filter(f => {
    return isSpecifiedImpact(f, Options.MODERATE)
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

export async function findHighImpactInGene(session: any, geneName: string, options: Options[]) {
  // 1) Look up the gene by name
  const geneMatches = await internalSearchGene(geneName, session)

  // 2) Gather all VCF track configs (no track ID needed)
  const vcfTracks = getAllVcfTrackConfigs(session)

  // This array will collect the final results
  const finalResults:any = []

  // 3) For each gene match (some genes have multiple isoforms/locations)

    //use @Tanya parsing function here
    const payload = parseTrixSearchMeta(geneMatches[1][1])

    // 4) For each VCF track, fetch the variants in that region
    for (const trackConfig of vcfTracks) {
      const allVariants = await fetchVariantsForRegion(
        session,
        trackConfig,
        payload?.chrom ?? '',
        payload?.start ?? 0,
        payload?.end ?? 0,
      )

      options.forEach((level) => {
        if(level == Options.HIGH){
          const highImpact = filterHighImpact(allVariants)
          if (highImpact.length > 0) {
            finalResults.push({
              trackId: trackConfig.trackId,
              trackName: trackConfig.name,
              chrom: payload?.chrom ?? '',
              highImpactVariants: highImpact,
            })
          }
        }

        if(level == Options.LOW){
          const lowImpact = filterLowImpact(allVariants)
          if (lowImpact.length > 0) {
            finalResults.push({
              trackId: trackConfig.trackId,
              trackName: trackConfig.name,
              chrom: payload?.chrom ?? '',
              highImpactVariants: lowImpact,
            })
          }
        }

        if(level == Options.MODERATE){
          const moderateImpact = filterModerateImpact(allVariants)
          if (moderateImpact.length > 0) {
            finalResults.push({
              trackId: trackConfig.trackId,
              trackName: trackConfig.name,
              chrom: payload?.chrom ?? '',
              highImpactVariants: moderateImpact,
            })
          }
        }
      })



      // 5) Filter for "high impact"
      
    }
  
  return finalResults
}

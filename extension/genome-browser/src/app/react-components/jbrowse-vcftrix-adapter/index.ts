/*
  VcfTrix JBrowse 2 plugin — single‑file version (steps 1‑5 & 7, no step 6)
  -------------------------------------------------------------------------
  This file contains:
    • Config schema for the adapter
    • Adapter implementation that re‑uses TrixTextSearchAdapter
    • Plugin.install() that registers the adapter
    • (at bottom) an example track configuration object you can paste into
      your JBrowse config.json

  Build & link (from plugin root):
      npm run build && jbrowse plugins link dist/jbrowse-plugin-vcftrix
*/

import { BaseFeatureDataAdapter, BaseOptions } from '@jbrowse/core/data_adapters/BaseAdapter'
import { ObservableCreate }       from '@jbrowse/core/util/rxjs'
import SimpleFeature, { Feature }          from '@jbrowse/core/util/simpleFeature'
import { readConfObject, ConfigurationSchema } from '@jbrowse/core/configuration'
import AdapterType              from '@jbrowse/core/pluggableElementTypes/AdapterType'
import Plugin               from '@jbrowse/core/Plugin'
// The official trix adapter exports both the config schema and the class
// We only need the class here for its search() implementation
import TrixTextSearchAdapter  from '@gmod/trix'
import { AugmentedRegion } from '@jbrowse/core/util'
import { Observable } from 'rxjs'

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
  
      let startGenePosition: number = 0;
      let endGenePosition: number = 0;
      let geneChrom: string  = '';
  
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
        ref: geneChrom,
        id: '',
      }
  }


/* ---------------------------------------------------------------------- */
/* 1 | adapter‑specific configuration schema                               */

export const configSchema = ConfigurationSchema('VcfTrixAdapter', {
  ixFilePath   : { type: 'fileLocation', defaultValue: { uri: '' } },
  ixxFilePath  : { type: 'fileLocation', defaultValue: { uri: '' } },
  metaFilePath : { type: 'fileLocation', defaultValue: { uri: '' } },
  assemblyNames: { type: 'stringArray',  defaultValue: [] },
})

/* ---------------------------------------------------------------------- */
/* 2 | the adapter class                                                   */

export default class VcfTrixAdapter extends BaseFeatureDataAdapter {
  private trix!: InstanceType<typeof TrixTextSearchAdapter>
  private meta: any[] | undefined

  public constructor(public override readonly config: any) {
    super(config)
    // re‑use the existing TrixTextSearchAdapter code for binary parsing
    // @ts‑ignore because plugin‑trix default export is a factory in TS defs
    // eslint‑disable‑next‑line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    this.trix = new (TrixTextSearchAdapter as TrixTextSearchAdapter)(config)
  }

  /* ---- helper to read metadata once and cache it in memory ------------ */
  private async loadMeta(): Promise<void> {
    if (!this.meta) {
      const loc  = readConfObject(this.config, 'metaFilePath').uri as string
      const json = await (await fetch(loc)).json()
      this.meta  = json as any[]
    }
  }

  /* -------------------------------------------------------------------- */
  async getRefNames(): Promise<string[]> {
    await this.loadMeta()
    return [...new Set(this.meta!.map(m => m.ref as string))]
  }

  /* -------------------------------------------------------------------- */
  getFeatures(region: AugmentedRegion, opts?: BaseOptions | undefined):Observable<Feature> {
    const { refName, start, end } = region
    return ObservableCreate(async observer => {
      await this.loadMeta()
      // 1. text search for the literal term "HIGH" in INFO/EFF
      const hits = await this.trix.search('(HIGH')


      // 2. translate docIDs back to meta rows and emit those overlapping
      for (const hit of hits) {
        const m = parseTrixSearchMeta(hits[1][1])!
        if (m.ref === refName && m.start < end && m.end > start) {
          observer.next(
            new SimpleFeature({
              id      : m.id ?? `${m.ref}:${m.start}`,
              data    : { ...m, triplet: hit },
              refName : m.ref,
              start   : m.start,
              end     : m.end,
            }),
          )
        }
      }
      observer.complete()
    })
  }

  /* optional cleanup hook ---------------------------------------------- */
  override freeResources() {
    /* nothing to unload */
  }
}

/* ---------------------------------------------------------------------- */
/* 3 | plugin definition that registers the adapter                        */

export class VcfTrixPlugin extends Plugin {
  name = 'VcfTrixPlugin'
  override install(pluginManager: any) {
    pluginManager.addAdapterType(
      () =>
        new AdapterType({
          name        : 'VcfTrixAdapter',
          getAdapterClass: async () => VcfTrixAdapter,
          configSchema,
        }),
    )
  }
}

/* ---------------------------------------------------------------------- */
/* 4 | example track configuration object                                  */

export const highImpactTrack = {
  trackId       : 'highImpact',
  name          : 'High‑impact SNVs',
  assemblyNames : ['GRCh38'],
  adapter       : {
    type        : 'VcfTrixAdapter',
    ixFilePath  : { uri: 'trix/variants.ix'  },
    ixxFilePath : { uri: 'trix/variants.ixx' },
    metaFilePath: { uri: 'trix/variants_meta.json' },
  },
  displays      : [{ type: 'LinearVariantDisplay' }],
} as const

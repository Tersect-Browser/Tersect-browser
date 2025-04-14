import TrixTextSearchAdapter  from '@gmod/trix'
import { fromUrl,open  } from 'generic-filehandle2'


const ixFile =  fromUrl('http://127.0.0.1:4300/TersectBrowserGP/datafiles/trix/SL2.50.ix')
const ixxFile =  fromUrl('http://127.0.0.1:4300/TersectBrowserGP/datafiles/trix/SL2.50.ixx')
const metaFile =  fromUrl('http://127.0.0.1:4300/TersectBrowserGP/datafiles/trix/SL2.50.meta.json')

export async function searchGene(term: string) {
  const adapter = new TrixTextSearchAdapter(ixxFile, ixFile , 30)


  const results = await adapter.search(term,
    {
        signal: new AbortController().signal
    },
  )

  console.log(results)
  return results; // added return statement to return the search results
}
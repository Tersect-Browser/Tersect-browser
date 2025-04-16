import tracks from '../../react-components/tracks'
import assembly from '../../react-components/assembly'
import config from '../../react-components/jbrowseConfig'
import { PrimeReactProvider, PrimeReactContext } from 'primereact/api';
import {
    createViewState,
    createModel,
    JBrowseLinearGenomeView,
    ViewModel
} from '@jbrowse/react-linear-genome-view'
import React, { useState, useEffect, useRef } from 'react';
import { AutoComplete } from 'primereact/autocomplete';
import { InputText } from 'primereact/inputtext';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { searchGene } from '../searchGene';

// If you have your searchGene function in a separate file, import it:
// import { searchGene } from './searchGene';

export default function GeneSearch() {
    const [query, setQuery] = useState('');
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [results, setResults] = useState<any[]>([]);
    const [showPopup, setShowPopup] = useState(false);

    // Fake local terms; you can replace this with a fetch or a real function
    const possibleTerms = ['BRCA1', 'TP53', 'MYC', 'EGFR', 'CDKN2A'];

    /**
     * Called by <AutoComplete> whenever it needs fresh suggestions.
     * 'event.query' has the current input text.
     */
    const handleComplete = (event: { query: string }) => {
        const filtered = possibleTerms.filter((term) =>
            term.toLowerCase().startsWith(event.query.toLowerCase())
        );
        setSuggestions(filtered);
    };

    /**
     * Basic parse function from your sample code
     * (You can remove it if you’re not actually using this logic.)
     */
    const parseResult = (result: any) => {
        const [id, raw] = result;
        try {
            const decoded = decodeURIComponent(raw)
                .replace(/^\[|\]$/g, '') // remove brackets
                .split('|');
            const [location, source, name, type] = decoded;
            return {
                id,
                location,
                source,
                name,
                type: type?.split('%3A')[0] || 'feature',
            };
        } catch (e) {
            return {
                id,
                location: 'unknown',
                source: 'unknown',
                type: 'unknown',
            };
        }
    };




    const state = createViewState({
        assembly,
        tracks,
        defaultSession: {
            name: 'default session',
            view: {
                type: 'LinearGenomeView',
                id: '1',
                bpPerPx: 50000,
                offsetPx: 0,
                displayedRegions: [
                    {
                        assemblyName: assembly.name,
                        start: 1,
                        end: 9000000,
                        refName: 'SL2.50ch01',
                    },
                ],
            },
        },
        
        configuration: config
    })

    
  

    state.session.addView('LinearGenomeView', {
        type: 'LinearGenomeView',
        id: '1',
        bpPerPx: 50000,
        offsetPx: 0,
        displayedRegions: [
            {
                assemblyName: assembly.name,
                start: 1,
                end: 9000000,
                refName: 'SL2.50ch01',
            },
        ],
    });
    const view = state.session.views[0];
    tracks.forEach(each => {
        view?.setHideHeader(true)
        // view?.scrollTo(50000, 900000)
        view?.showTrack(each.trackId)
    })

    /**
     * Called by the search button or onSelect from the AutoComplete.
     * Replace this with your actual search.
     */
    const search = async (query: string) => {
        console.log('ran the search', query)
        if (!query) return;

        // Example results (simulate an API call
        const testResults = await searchGene(query, state.session)

        console.log(testResults)
        // const newResults = await searchGene(query);
        const newResults = [
            ['gene1', encodeURIComponent('[chr1|source1|BRCA1|type:Gene]')],
            ['gene2', encodeURIComponent('[chr2|source2|TP53|type:Gene]')],
        ];

        setResults(newResults);
        setShowPopup(true);
    };

    return (
        <PrimeReactProvider>
            <div className="p-inputgroup" style={{ position: 'relative' }}>
                <InputText
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search for a gene..."
                />
                <Button label="Search" onClick={() => search(query)} />

                <Dialog
                    header="Search Results"
                    visible={showPopup}
                    style={{ width: '30rem' }}
                    onHide={() => setShowPopup(false)}
                >
                    {results.length > 0 ? (
                        results.map((r, idx) => {
                            const parsed = parseResult(r);
                            return <div key={idx}>{parsed.name ?? r[0]}</div>;
                        })
                    ) : (
                        <i>No results found</i>
                    )}
                </Dialog>
            </div>
        </PrimeReactProvider>
    );
}

import tracks from '../../react-components/tracks'
import assembly from '../../react-components/assembly'
import config from '../../react-components/jbrowseConfig'
import 'primereact/resources/themes/lara-light-indigo/theme.css'; //theme
import 'primereact/resources/primereact.min.css'; //core css             // core styles

import { PrimeReactProvider } from 'primereact/api';
import {
    createViewState,
} from '@jbrowse/react-linear-genome-view'
import React, { useState } from 'react';
import { InputText } from "primereact/inputtext";
import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { Checkbox } from "primereact/checkbox";
import { searchGene, Options } from '../searchGene';


function GeneSearch(props:any) {
    console.log(props, 'from angular')
    const [query, setQuery] = useState('');
    const [showDialog, setShowDialog] = useState(false);

  const [selectedImpacts, setSelectedImpacts] = useState<Options[]>([]);
  const [loading, setLoading] = useState(false);

  // checkbox values
  const impacts = [Options.HIGH, Options.LOW, Options.MODERATE];

  const toggleImpact = (value:Options) => {
    setSelectedImpacts((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  };

  const handleSearch = async () => {
    if (!query.trim()) return; // ignore empty search
    setLoading(true);
    try {
      const results  = await searchGene(query, state.session, selectedImpacts);
      // optional external callback (if still needed)
      props?.callback?.(results);
    } finally {
      setLoading(false);
      setShowDialog(false);
      setQuery("");
      setSelectedImpacts([]);
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

        const testResults = await searchGene(query, state.session)

        props.callback(testResults);
    };

    return (
      <div className="p-inputgroup" style={{ position: "relative" }}>
        {/* Trigger Button */}
        <Button
          label="Open Variant Search"
          onClick={() => setShowDialog(true)}
          outlined
        />

        {/* Search Dialog */}
        <Dialog
          header="Variant Search"
          visible={showDialog}
          style={{ width: "30rem" }}
          modal={true}
          onHide={() => setShowDialog(false)}
          position="top" // renders right below trigger button
        >
          {/* Search input */}
          <div className="p-fluid mb-3">
            <label htmlFor="geneSearchInput" className="block mb-1">
              Gene ID
            </label>
            <InputText
              id="geneSearchInput"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search for a gene..."
            />
          </div>

          {/* Checkbox group */}
          <div className="mb-3">
            <label className="block mb-2 font-semibold">Choose Impact</label>
            {impacts.map((level) => (
              <div key={level} className="flex items-center gap-2 mb-2">
                <Checkbox
                  inputId={`impact-${level}`}
                  checked={selectedImpacts.includes(level)}
                  onChange={() => toggleImpact(level)}
                />
                <label htmlFor={`impact-${level}`}>{level}</label>
              </div>
            ))}
          </div>

          {/* Search button with loader */}
          <Button
            label={loading ? "Searching..." : "Search for variants"}
            icon={loading ? "pi pi-spin pi-spinner" : undefined}
            loading={loading} // PrimeReact v9 supports this prop; if older, icon+disabled fallback works
            disabled={loading}
            className="w-full"
            onClick={handleSearch}
          />
        </Dialog>
      </div>
    );
}

export default function WrappedApp (props: any) {
    return (
        <PrimeReactProvider>
            <GeneSearch {...props} />
        </PrimeReactProvider>
    );
}

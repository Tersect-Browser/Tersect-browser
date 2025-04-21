import tracks from '../../react-components/tracks'
import assembly from '../../react-components/assembly'
import config from '../../react-components/jbrowseConfig'
import 'primereact/resources/themes/saga-green/theme.css'; //theme
import 'primereact/resources/primereact.min.css'; //core css
import 'primeflex/primeflex.css';

import { PrimeReactProvider } from 'primereact/api';
import {
    createViewState,
} from '@jbrowse/react-linear-genome-view'
import React, { useRef, useState } from 'react';
import { InputText } from "primereact/inputtext";
import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { Checkbox } from "primereact/checkbox";
import { searchGene, Options } from '../searchGene';
import { createRoot } from 'react-dom/client';


function GeneSearch(props:any) {
    const [query, setQuery] = useState('');
    const [showDialog, setShowDialog] = useState(false);

  const [selectedImpacts, setSelectedImpacts] = useState<Options[]>([]);
  const [loading, setLoading] = useState(false);
  const triggerRef = useRef(null);

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
    //   setQuery("");
    //   setSelectedImpacts([]);
    }
  };





  const [state] = useState(() => {
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

    return state;

  })


 

    return (
        <div className="relative inline-block" ref={triggerRef}>
        {/* Trigger Button */}
        <Button
          label="Open Variant Search"
          style={{
            backgroundColor: '#459e00',
            borderRadius: '4px',
            padding: '2px',
            color: 'white',
            fontSize: '16px',
            paddingRight: '10px',
            paddingLeft: '10px',
            borderColor: '#327e04'
          }}
          onClick={() => setShowDialog(true)}
          outlined
        />

        {/* Search Dialog anchored to button */}
        <Dialog
          header="Variant Search"
          visible={showDialog}
          style={{ width: "50rem", top: "100px" }}
          modal={true}           /* no page‑blocking overlay */
          onHide={() => setShowDialog(false)}
          position="top-right"      /* opens below */
          appendTo={triggerRef.current} /* keep it right under the button */
          draggable={false}
        >
          {/* Search input */}
          <div className="p-fluid mb-3">
            <label htmlFor="geneSearchInput" className="block mb-1">
              Gene IDX
            </label>
            <InputText
              id="geneSearchInput"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search for a gene…"
            />
          </div>

          {/* Checkbox group */}
          <div className="mb-3">
            <label className="block mb-2 font-semibold">Choose Impact</label>
            <div style={{display: 'flex', gap: '8px'}}>
            {impacts.map((level) => (
              <div key={level} className="flex items-center gap-2 mb-2">
                <Checkbox
                  inputId={`impact-${level}`}
                  checked={selectedImpacts.includes(level)}
                  onChange={() => toggleImpact(level)}
                />
                <label style={{marginLeft: '5px'}} htmlFor={`impact-${level}`}>{level}</label>
              </div>
            ))}
            </div>
          </div>

          {/* Search button with loader */}
          <Button
            label={loading ? "Searching…" : "Search for variants"}
            icon={loading ? "pi pi-spin pi-spinner" : undefined}
            loading={loading}
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

// Register as custom element
// class GeneSearchWidget extends HTMLElement {
//   connectedCallback() {
//     const mountPoint = document.createElement('div');
//     this.appendChild(mountPoint);
//     createRoot(mountPoint).render(<WrappedApp />);
//   }
// }

// customElements.define('gene-search', GeneSearchWidget);

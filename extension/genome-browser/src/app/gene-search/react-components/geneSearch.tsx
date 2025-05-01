import tracks from '../../react-components/tracks'
import assembly from '../../react-components/assembly'
import config from '../../react-components/jbrowseConfig'
import 'primereact/resources/themes/saga-green/theme.css' // theme
import 'primereact/resources/primereact.min.css' // core css
import './geneSearchStyles.css'
import 'primeflex/primeflex.css'

import { PrimeReactProvider } from 'primereact/api'
import {
  createViewState,
  ViewModel,
} from '@jbrowse/react-linear-genome-view'
import React, { useEffect, useRef, useState } from 'react'
import { AutoComplete } from 'primereact/autocomplete'
import { Button } from 'primereact/button'
import { Dialog } from 'primereact/dialog'
import { Divider } from 'primereact/divider';
import { Slider } from 'primereact/slider'
import { Dropdown } from 'primereact/dropdown';
import { InputNumber } from 'primereact/inputnumber'
import { searchGene, ImpactLevel, getSuggestions } from '../searchGene'

/**
 * Extends the original GeneSearch component by
 * – replacing the free‑text input with a PrimeReact <AutoComplete>
 * – adding a numeric range selector (PrimeReact <Slider range />) so callers can
 *   constrain the genomic position (or any numeric field you need).
 */
function GeneSearch(props: any) {
  console.log(props)
  
    // ---------- JBrowse view ----------

  const [query, setQuery] = useState<string>('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  // Replace 0/1 000 000 with a sensible default for your dataset
  const [range, setRange] = useState<[number, number]>(props?.selectedInterval)
  const [showDialog, setShowDialog] = useState<boolean>(false)
  const [viewState, setViewState] = useState<ViewModel>()

  const [selectedImpacts, setSelectedImpacts] = useState<ImpactLevel>(ImpactLevel.HIGH)
  const [loading, setLoading] = useState<boolean>(false)
  const triggerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const handler = (e: CustomEvent<{ interval: [number, number] }>) => {
      setRange(e.detail.interval);
      setShowDialog(true);
      handleSearch(e.detail.interval);
    }
   

    // add
    window.addEventListener("tersect-search-variants", handler as EventListener);
    console.log('registered')

    // clean up
    return () =>
      window.removeEventListener("tersect-search-variants", handler as EventListener);
  },[])

  // ---------- AutoComplete helper ----------
  // Accept a list of gene IDs from the parent, otherwise keep an empty list.
  const geneOptions: string[] =  []

  const completeGeneId = async (e: { query: string }) => {
    const q = e.query.trim().toLowerCase()
    if (!q) {
      setSuggestions([])
      return
    }
    const result = await getSuggestions(q)
    setSuggestions(
       result// cap for performance
    )
  } 



  // ---------- UI helpers ----------
  const impacts = [ImpactLevel.HIGH]
  // , ImpactLevel.LOW, ImpactLevel.MODERATE]

  const toggleImpact = (value: ImpactLevel) => {
    setSelectedImpacts(value)
  }

  const handleSearch = async (recentInterval?: [number, number]) => {
    // if (!query.trim()) return
    setLoading(true)
    try {
      const results = await searchGene(
        query,
        viewState?.session,
        selectedImpacts,
        props?.chromosome?.name,
        recentInterval ?? range,
        props?.datasetId
      )
      console.log(results);
      
      props?.callback?.(results)
    } finally {
      setLoading(false)
      setShowDialog(false)
    }
  }

  return (
    <div className="relative inline-block" ref={triggerRef}>
      {/* Trigger */}
      <Button
        label="Open Variant Search"
        style={{
          backgroundColor: '#459e00',
          borderRadius: 4,
          padding: 2,
          color: 'white',
          fontSize: 16,
          paddingRight: 10,
          paddingLeft: 10,
          borderColor: '#327e04',
        }}
        onClick={() => setShowDialog(true)}
        outlined
      />

      {/* Dialog */}
      <Dialog
        header="Variant Search"
        visible={showDialog}
        style={{ width: '50rem', top: '100px' }}
        modal
        onHide={() => setShowDialog(false)}
        position="top-right"
        appendTo={triggerRef.current as any}
        draggable={false}
      >
        <p className='block mb-2'>Search by interval</p>

        {/* Range selector */}
        <div className={query ? 'opacity-20' : 'opacity-1'}>
        <div className="mb-5">
          <label className="block mb-2 font-semibold">Position range (bp)</label>
          <Slider min={1} value={range} step={1} max={98543444} onChange={e => {
            console.log(e.value)
            setRange(e.value as [number, number])}}    range className="w-full" />
          <div className="flex justify-between mt-2">
            <InputNumber
              value={range[0]}
              onValueChange={e => setRange([e.value ?? 0, range[0]])}
              min={1}
              step={1}
              max={98543444}
              mode="decimal"
              useGrouping={false}
              inputClassName="w-full"
            />
            <span className="px-2">to</span>
            <InputNumber
              value={range[1]}
              step={1}
              onValueChange={e => setRange([range[0], e.value ?? range[1]])}
              min={1}
            max={98543444}
              mode="decimal"
              useGrouping={false}
              inputClassName="w-full"
            />
          </div>
        </div>
         {/* Impact checkboxes */}
        <div className="mb-4">
          <label className="block mb-2 font-semibold">Choose Impact</label>
          <div className="flex gap-3">
            {impacts.map(level => (
              <div key={level} className="flex items-center gap-2">
                <Dropdown
                  inputId={`impact-${level}`}
                  value={selectedImpacts}
                  onChange={(e) => toggleImpact(e.value)}
                  options={[ImpactLevel.HIGH, ImpactLevel.MODERATE, ImpactLevel.LOW]}
                />
              </div>
            ))}
          </div>
        </div>
        </div>
        <Divider type="dashed" />
        {/* Gene ID autocomplete */}
        <p className='block mb-2'>Search by high impact gene id (optional)</p>
        <div className="p-fluid mb-3">
          <label htmlFor="geneSearchAuto" className="block mb-1">
            Gene ID
          </label>
          <AutoComplete
            inputId="geneSearchAuto"
            value={query}
            suggestions={suggestions}
            completeMethod={completeGeneId}
            onChange={e => setQuery(e.value)}
            placeholder="Start typing…"
            forceSelection={false}
            className="w-full"
          />
        </div>

       

        {/* Search */}
        <Button
          label={loading ? 'Searching…' : 'Search for variants'}
          icon={loading ? 'pi pi-spin pi-spinner' : undefined}
          loading={loading}
          disabled={loading}
          onClick={() => handleSearch()}
          className="w-full"
        />
      </Dialog>
    </div>
  )
}

export default function WrappedApp(props: any) {
  return (
    <PrimeReactProvider>
      <GeneSearch {...props} />
    </PrimeReactProvider>
  )
}



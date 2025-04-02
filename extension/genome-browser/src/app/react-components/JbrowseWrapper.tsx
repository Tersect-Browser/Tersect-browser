import React from 'react';
import {
  createViewState,
  JBrowseLinearGenomeView,
  ViewModel
} from '@jbrowse/react-linear-genome-view'
import assembly from './assembly';
import tracks from './tracks';
import { JbrowseWrapperProps } from '../../../../../common/JbrowseInterface'
import JbrowseWithAccessionName from './JbrowseWithAccession';
import themeStyles from './jbrowseConfig';

// Test trackID for tracks[1].trackID
const accName = "S.lyc LA2838A";


function JbrowserWrapper(props: JbrowseWrapperProps) {
  const propsZoomLevel = props.location?.zoomLevel ?? 100;
  if (props?.location?.accession?.name) return <JbrowseWithAccessionName accessionName={props.location?.accession?.name ?? accName} location={props.location} />
  const state = createViewState({
    assembly,
    tracks,
    defaultSession: {
      name: 'default session',
      view: {
        type: 'LinearGenomeView',
        id: '1',
        bpPerPx: props?.location?.binSize ?? 50000,
        displayedRegions:  tracks.slice(0, 1).map(each => ({
          assemblyName: assembly.name,
            start: props?.location?.start ?? 1,
            end: props?.location?.end ?? 9500000,
            refName: each.trackId,
          
        }))
      },
    },

    configuration: themeStyles,
  })


  state.assemblyManager.waitForAssembly(assembly.name).then(data => {
    const propsBinSize = props.location?.binSize ?? 50000;
    
    const propsStart = props.location?.start ?? 1;
    const propsEnd = props.location?.end ?? 9500000;
    console.log('in react', {propsBinSize, propsZoomLevel, propsStart, propsEnd});
    
    if (state.session.views.length > 0) {
      state.session.removeView();
    }
    state.session.addView('LinearGenomeView', {
      type: 'LinearGenomeView',
      id: '1',
      bpPerPx: ((propsBinSize) * (100 /propsZoomLevel)),
      displayedRegions: [
        {
          assemblyName: assembly.name,
          start: propsStart,
          end: propsEnd,
          refName: tracks[0].name,
        },
      ],
    })
  
      tracks.slice(0, 1).forEach(each => {
        // state.session.views[0].horizontalScroll(-10)
        // state.session.views[0]?.setHideHeader(true)
        state.session.views[0]?.showTrack(each.trackId)
      })
  })


  return (
    // <div style={{ height: '200px', overflow: 'auto' }}>
    <JBrowseLinearGenomeView key={propsZoomLevel}   viewState={state}/>
  // </div>
  )
}

export default JbrowserWrapper

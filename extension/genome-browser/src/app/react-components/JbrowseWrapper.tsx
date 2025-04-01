import React, { useEffect, useRef, useState } from 'react';
import { reaction } from "mobx";  
import {
  createViewState,
  JBrowseLinearGenomeView,
  ViewModel
} from '@jbrowse/react-linear-genome-view'
import assembly from './assembly';
import tracks from './tracks';


const JbrowseWithState = ({state} : {state: ViewModel}) => {
  return <JBrowseLinearGenomeView
  viewState={state} />
}

// Test trackID for tracks[1].trackID
const accName = "S.lyc LA2838A";


function JbrowserWrapper(props: any) {
  const accessionName = (props.location?.accession?.name || accName);
  // const accessionName = false;

    // Define default view state, with default pre-selected chromosome matching drop-down menu selected
    const state = createViewState({
        assembly,
        tracks,
        defaultSession: {
          name: 'default session',
          view: {
            type: 'LinearGenomeView',
            id: '1',
            bpPerPx: props.location.binSize,
            offsetPx: 0,
            displayedRegions: [
              {
                assemblyName: assembly.name,
                start: props.location.start,
                end: props.location.preselectedChromosome.size,
                refName: props.location.preselectedChromosome.name,
              },
            ],
          },
        },
     
        configuration: {
          "theme": {
            "palette": {
              "primary": {
                "main": "#459e00"
              },
              "secondary": {
                "main": "#459e00"
              },
              "tertiary": {
                "main": "#459e00"
              },
              "quaternary": {
                "main": "#459e00"
              }
            }
      
          },
        
        },
        

      })


      if (accessionName){
        // create view state
        state.assemblyManager.waitForAssembly(assembly.name).then(data => {

          // remove previously loaded view states
          if (state.session.views.length > 0) {
            state.session.removeView();
          }

          // update view state
          state.session.addView('LinearGenomeView', {
            type: 'LinearGenomeView',
            id: '1',
            bpPerPx: ((props.location.binSize) * (100 /props.location.zoomLevel)),
            offsetPx: 0,
            displayedRegions: [
              {
                assemblyName: assembly.name,
                start: props.location.start,
                end: props.location.chromosome.size,
                refName: props.location.chromosome.name,
              },
            ],
          })

          const accessionTrack = tracks.find(track => track.trackId == accessionName);
          if (accessionTrack){
            state.session.views[0].horizontalScroll(-10)
            state.session.views[0]?.setHideHeader(true)
            // state.session.views[0]?.scrollTo(50000, 900000)
            state.session.views[0]?.showTrack(accessionTrack.trackId)
          }
        })
      } else {
        state.assemblyManager.waitForAssembly(assembly.name).then(data => {

          // remove previously loaded view states
          if (state.session.views.length > 0) {
            state.session.removeView();
          }

          // update view state with selected chromosome
          state.session.addView('LinearGenomeView', {
            type: 'LinearGenomeView',
            id: '1',
            bpPerPx: ((props.location.binSize) * (100 /props.location.zoomLevel)),
            offsetPx: 0,
            displayedRegions: [
              {
                assemblyName: assembly.name,
                start: props.location.start,
                end: props.location.chromosome.size,
                refName: props.location.chromosome.name,
              },
            ],
          })
          console.log('added view', state.session.views.length);
          // state.session.views[0]?.showTrack(tracks[0].trackId)
          tracks.slice(0, 3).forEach(each => {
            state.session.views[0].horizontalScroll(-10)
            state.session.views[0]?.setHideHeader(true)
            // state.session.views[0]?.scrollTo(50000, 900000)
            state.session.views[0]?.showTrack(each.trackId)
          })
        })
      }

    //@ts-ignore
  return <JbrowseWithState state={state} />
}

export default JbrowserWrapper

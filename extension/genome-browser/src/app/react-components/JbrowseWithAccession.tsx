import React from 'react';
import {
  createViewState,
  JBrowseLinearGenomeView,
  ViewModel,
} from '@jbrowse/react-linear-genome-view'
import assembly from './assembly';
import tracks from './tracks';
import config from './jbrowseConfig';


const JbrowseWithState = ({ state }: { state: ViewModel }) => {
  return <JBrowseLinearGenomeView
    viewState={state} />
}

const JbrowseWithAccessionName = ({accessionName, location}:{ accessionName: string, location: any}) => {
  console.log(accessionName, 'accessionName')

  const state = createViewState({
    assembly,
    tracks,
    defaultSession: {
      name: 'default session',
      view: {
        type: 'LinearGenomeView',
        id: '1',
        bpPerPx: location?.accession?.binSize ?? 1,
        offsetPx: 0,
        displayedRegions: [
          {
            assemblyName: assembly.name,
            start: location?.accession?.defaultInterval?.[0] ?? 0,
            end: location?.accession?.defaultInterval?.[1] ?? 0,
            refName: location?.accession?.preselectedChromosome?.name ?? '',
          },
        ],
      },
    },

    configuration: config
  })



  state.assemblyManager.waitForAssembly(assembly.name).then(data => {

    // remove previously loaded view states
    if (state.session.views.length > 0) {
      state.session.removeView();
    }

    // update view state with selected chromosome
    state.session.addView('LinearGenomeView', {
      type: 'LinearGenomeView',
      id: '1',
      bpPerPx: ((location?.accession?.binSize ?? 1) * (100 / (location?.accession?.zoomLevel ?? 1))),
      offsetPx: 0,
      displayedRegions: [
        {
          assemblyName: assembly.name,
          start: location?.accession?.selectedInterval?.[0] ?? 0,
          end: location?.accession?.selectedInterval?.[1] ?? 0,
          refName: location?.accession?.chromosome?.name ?? '',
        },
      ],
    })
    // Add the variant tracks
    console.log('added view', location?.accession?.chromosome?.name);
    // state.session.views[0]?.showTrack(tracks[0].trackId)
    const targetTrack = tracks.find((track) => track.trackId === accessionName);
    if (targetTrack && state.session.views[0]?.initialized) {
      state.session.views[0]?.showTrack(assembly.sequence.trackId);
      state.session.views[0]?.showTrack(tracks[0].trackId);
      state.session.views[0]?.showTrack(targetTrack.trackId)
    } else {
    tracks.slice(0, 3).forEach(each => {

      state.session.views[0]?.setHideHeader(true)
      // state.session.views[0]?.scrollTo(50000, 900000)
      state.session.views[0]?.showTrack(each.trackId)
    })
    // state.session.views[0].horizontalScroll(-(location.offsetCanvas - 4))
  }
  })


  //@ts-ignore
  return <JbrowseWithState key={location?.accession?.chromosome?.name} state={state} />
  
}

export default JbrowseWithAccessionName;
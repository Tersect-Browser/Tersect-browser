import React from 'react';
import {
  createViewState,
  JBrowseLinearGenomeView,
  ViewModel
} from '@jbrowse/react-linear-genome-view'
import assembly from './assembly';
import tracks from './tracks';
import config from './jbrowseConfig';
import JbrowseWithAccessionName from './JbrowseWithAccession';
import { JbrowseWrapperProps } from '../../../../../common/JbrowseInterface';


const JbrowseWithState = ({ state }: { state: ViewModel }) => {
  return <JBrowseLinearGenomeView
    viewState={state} />
}

function JbrowserWrapper(props: JbrowseWrapperProps) {
  if(props?.location?.accession?.name) {
    return <JbrowseWithAccessionName accessionName={props.location.accession.name} location={props.location}  />
  }

  // Define default view state, with default pre-selected chromosome matching drop-down menu selected
  if (!props.location?.defaultInterval || !props.location?.offsetCanvas) {
    return <div>Loading...</div>; // Prevents state initialization
  }



  const state = createViewState({
    assembly,
    tracks,
    defaultSession: {
      name: 'default session',
      view: {
        type: 'LinearGenomeView',
        id: '1',
        bpPerPx: props.location?.binSize ?? 1,
        offsetPx: 0,
        displayedRegions: [
          {
            assemblyName: assembly.name,
            start: props.location?.defaultInterval?.[0] ?? 0,
            end: props.location?.defaultInterval?.[1] ?? 0,
            refName: props.location?.preselectedChromosome?.name ?? '',
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
      bpPerPx: ((props.location?.binSize ?? 1) * (100 / (props.location?.zoomLevel ?? 1))),
      offsetPx: 0,
      displayedRegions: [
        {
          assemblyName: assembly.name,
          start: props.location?.selectedInterval?.[0] ?? 0,
          end: props.location?.selectedInterval?.[1] ?? 0,
          refName: props.location?.chromosome?.name ?? '',
        },
      ],
    })
    // Add the variant tracks
    console.log('added view', state.session.views.length);
    // state.session.views[0]?.showTrack(tracks[0].trackId)
    tracks.slice(0, 3).forEach(each => {

      state.session.views[0]?.setHideHeader(true)
      // state.session.views[0]?.scrollTo(50000, 900000)
      state.session.views[0]?.showTrack(each.trackId)
    })
    state.session.views[0].horizontalScroll(-(props.location.offsetCanvas - 4))
  })


  //@ts-ignore
  return <JbrowseWithState key={props?.location.zoomLevel} state={state} />
}

export default JbrowserWrapper
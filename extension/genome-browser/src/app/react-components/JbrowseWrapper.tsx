import React, { useEffect, useState } from 'react';
import {
  createViewState,
  JBrowseLinearGenomeView,
  ViewModel
} from '@jbrowse/react-linear-genome-view'
import assembly from './assembly';
import tracks from './tracks';
import config from './jbrowseConfig';
import JbrowseWithAccessionName from './JbrowseWithAccession';



export interface JbrowseWrapperProps {
  location?: any
}



const JbrowseWithState = ({ state }: { state: ViewModel }) => {
  return <JBrowseLinearGenomeView
    viewState={state} />
}

type ViewState = ReturnType<typeof createViewState>

function JbrowserWrapper(props: JbrowseWrapperProps) {
  const [state] = useState<ViewState>(() => {
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
      
  
      configuration: config,
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
        bpPerPx: ((props?.location?.binSize ?? 1) * (100 / (props?.location?.zoomLevel ?? 100))),
        offsetPx: 0,
        displayedRegions: [
          {
            assemblyName: assembly.name,
            start: props.location?.selectedInterval?.[0] ?? 0,
            end: props?.location?.selectedInterval?.[1] ?? 0,
            refName: props?.location?.chromosome?.name ?? '',
          },
        ],
      })

      const view = state.session.views[0];
   
      // Add the variant tracks
      console.log('added view', state.session.views.length);
      // state.session.views[0]?.showTrack(tracks[0].trackId)
      tracks.slice(0, 3).forEach(each => {

        view?.setHideHeader(true)
        // view?.scrollTo(50000, 900000)
        view?.showTrack(each.trackId)
        
      })
      if(view.initialized){
        view.horizontalScroll(-(props?.location?.offsetCanvas - 4))
      }
      
    })

    return state;
  })



  useEffect(() => {
    if(!state) return;
    const session = state.session;
    const view = session?.views[0];
    if (!session || !props?.location?.chromosome?.name) return;



    const bpPerPx = ((props.location?.binSize ?? 1) * (100 / (props.location?.zoomLevel ?? 100)));
    const start = ((-(props?.location?.plotPositionX.x * (props?.location.zoomLevel/100)) * (((props?.location?.binSize ?? 1) * (100 / (props?.location?.zoomLevel ?? 1))))) + props?.location?.selectedInterval?.[0]) 
    const end = props?.location?.selectedInterval?.[1] ?? 0;

    if(view?.initialized){

      view.setNewView?.(bpPerPx,  start / bpPerPx);
      view.horizontalScroll(-(props?.location?.offsetCanvas - 4));
    };
  }, [
    props?.location?.chromosome?.name,
    props?.location?.zoomLevel,
    props?.location?.plotPositionX?.x,
    props?.location?.offsetCanvas,
    props?.location?.selectedInterval,
    props?.location?.binSize,
    props?.location?.offsetCanvas,

  ]);

  useEffect(() => {
    if(!state) return;
    const session = state.session;
    console.log()
    state.assemblyManager.waitForAssembly(assembly.name).then(data => {
  
      // remove previously loaded view states
      if (state.session.views.length > 0) {
        state.session.removeView();
      }
  
      // update view state with selected chromosome
      state.session.addView('LinearGenomeView', {
        type: 'LinearGenomeView',
        id: `linear-genome-view-${props.location?.chromosome?.name}`,
        bpPerPx: ((props.location?.binSize ?? 1) * (100 / (props.location?.zoomLevel ?? 100))),
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
    
      const view = state.session.views.find(each => each.id === `linear-genome-view-${props.location?.chromosome?.name}`);
      view?.setHideHeader(true)
      console.log(view, 'set hide header after')
      console.log('added view', state.session.views.length);
        // state.session.views[0]?.showTrack(tracks[0].trackId)
        tracks.slice(0, 3).forEach(each => {

          view?.setHideHeader(true)
          console.log(each, 'each track after switching chromosomes')
          // view?.scrollTo(50000, 900000)
          view?.showTrack(each.trackId)
          
        })
      if(view?.initialized){
        view?.horizontalScroll(-(props?.location?.offsetCanvas - 4))
        console.log('ran chrom effect')
      }

      
    })
  }, [props?.location?.chromosome?.name])

  if(props?.location?.accession?.name) {
    return <JbrowseWithAccessionName accessionName={props.location.accession.name} location={props.location}  />
  }

  // Define default view state, with default pre-selected chromosome matching drop-down menu selected
  if (!props.location) {
    return <div>Loading...</div>; // Prevents state initialization
  }


  if(!state) return <div>Loading...</div>


  //@ts-ignore
  return <JbrowseWithState key={props.location.chromosome}   state={state} />
}


// class JbrowseWidget extends HTMLElement {
//   connectedCallback() {
//     const mountPoint = document.createElement('div');
//     this.appendChild(mountPoint);
//     createRoot(mountPoint).render(<JbrowserWrapper />);
//   }
// }

// customElements.define('gene-search', JbrowseWidget);

export default JbrowserWrapper
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  createViewState,
  JBrowseLinearGenomeView,
  ViewModel
} from '@jbrowse/react-linear-genome-view'
import type PluginManager from '@jbrowse/core/PluginManager'
import Plugin from '@jbrowse/core/Plugin'
import { types } from 'mobx-state-tree'
import assembly from './assembly';
import tracks from './tracks';
import config from './jbrowseConfig';
import JbrowseWithAccessionName from './JbrowseWithAccession';


class DisableScroll extends Plugin {
  name: 'MyPlugin' = "MyPlugin";
  override install(pluginManager: PluginManager) {
    pluginManager.addToExtensionPoint(
      'Core-extendPluggableElement',
      pluggableElement => {
        // @ts-expect-error
        if (pluggableElement.name === 'LinearGenomeView') {
          // @ts-expect-error
          pluggableElement.stateModel = types.compose(
            // @ts-expect-error
            pluggableElement.stateModel,
            types.model().actions(_self => {
               //@ts-expect-error
              console.log(_self.scrollTo)
              return ({
            
              
              zoomTo: (args:any) => {
                console.log(args)
              },

              scrollTo: () => {

              }
            })}),
          )
        }
        return pluggableElement
      },
    )
  }
  override configure() {}
}


export interface JbrowseWrapperProps {
  location?: any
}


const JbrowseWithState = ({ state }: { state: ViewModel }) => {
  return <JBrowseLinearGenomeView
    viewState={state} />
}

type ViewState = ReturnType<typeof createViewState>

function JbrowserWrapper(props: JbrowseWrapperProps) {
  const stateRef = useRef<null | ViewState>(null);
  const [isInitialised, setIsInitialized] = useState(false);

  useLayoutEffect(() => {
    document.querySelectorAll('[data-testid="view_menu_icon"]').forEach(each => {
      each.parentElement?.remove()
    })
    const state = createViewState({
      assembly,
      tracks,
      plugins: [DisableScroll],
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

      const view = state.session.views[0];
      stateRef.current = state
      setIsInitialized(true);
      view?.setHideHeader(true)
      view?.showTrack(tracks[0].trackId)
    })
  }, [])

  useEffect(() => {
    if(!stateRef?.current) return;
    const session = stateRef?.current?.session;
    const view = session?.views[0];
    if (!session || !props?.location.chromosome?.name) return;



    const bpPerPx = ((props.location?.binSize ?? 1) * (100 / (props.location?.zoomLevel ?? 1)));
    const start = ((-(props?.location?.plotPositionX.x * (props?.location.zoomLevel/100)) * (((props?.location?.binSize ?? 1) * (100 / (props?.location?.zoomLevel ?? 1))))) + props?.location?.selectedInterval?.[0]) 
    const end = props?.location?.selectedInterval?.[1] ?? 0;

    if(view?.initialized){

      view.setNewView?.(bpPerPx,  start / bpPerPx);
      view.horizontalScroll(-(props?.location?.offsetCanvas - 4));
    };
  }, [
    props?.location.chromosome?.name,
    props?.location.zoomLevel,
    props?.location.plotPositionX?.x,
    props?.location.offsetCanvas,
    props?.location.selectedInterval,
    props?.location.binSize,
    props?.location?.offsetCanvas,

  ]);

  useEffect(() => {
    if(!stateRef?.current) return;
    const session = stateRef?.current?.session;
    const state = stateRef?.current;
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
    
      const view = state.session.views.find(each => each.id === `linear-genome-view-${props.location?.chromosome?.name}`);
      view?.setHideHeader(true)
      console.log(view, 'set hide header after')
      console.log('added view', state.session.views.length);
        // state.session.views[0]?.showTrack(tracks[0].trackId)

          view?.setHideHeader(true)
          view?.showTrack(tracks[0].trackId)

    })
  }, [props?.location?.chromosome?.name])

  console.log(props.location.chromosome)
  if(props?.location?.accession?.name) {
    return <JbrowseWithAccessionName accessionName={props.location.accession.name} location={props.location}  />
  }

  // Define default view state, with default pre-selected chromosome matching drop-down menu selected
  if (!props.location?.defaultInterval || !props.location?.offsetCanvas) {
    return <div>Loading...</div>; // Prevents state initialization
  }


  if(!stateRef.current || !isInitialised) return <div>Loading...</div>


  //@ts-ignore
  return <JbrowseWithState key={ `${props?.location.offsetCanvas}-${props.location?.binSize}`}   state={stateRef.current} />
}

export default JbrowserWrapper
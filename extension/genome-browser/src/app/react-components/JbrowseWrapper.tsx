import React from 'react';
import {
  createViewState,
  JBrowseLinearGenomeView,
  ViewModel
} from '@jbrowse/react-linear-genome-view'
import assembly from './assembly';
import tracks from './tracks';
import {JbrowseWrapperProps} from '../../../../../common/JbrowseInterface'


const JbrowseWithState = ({state} : {state: ViewModel}) => {
  return <JBrowseLinearGenomeView
  viewState={state} />
}





function JbrowserWrapper(props: JbrowseWrapperProps) {
    const state = createViewState({
        assembly,
        tracks,
        defaultSession: {
          name: 'default session',
          view: {
            type: 'LinearGenomeView',
            id: '1',
            bpPerPx: props?.location?.binSize ?? 50000,
            offsetPx: 0,
            displayedRegions: [
              {
                assemblyName: assembly.name,
                start: props?.location?.start ?? 1,
                end: props?.location?.end ?? 9500000,
                refName: tracks[0].name,
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

    



      state.assemblyManager.waitForAssembly(assembly.name).then(data => {
        state.session.addView('LinearGenomeView', {
          type: 'LinearGenomeView',
          id: '1',
          bpPerPx: ((props.location.binSize) * (100 /props.location.zoomLevel)),
          offsetPx: 0,
          displayedRegions: [
            {
              assemblyName: assembly.name,
              start: props.location.start,
              end: props.location.end,
              refName: Object.keys(data?.refNameAliases!)[0],
            },
          ],
        })
        // state.session.views[0]?.showTrack(tracks[0].trackId)
        tracks.slice(0, 3).forEach(each => {
          state.session.views[0].horizontalScroll(-10)
          state.session.views[0]?.setHideHeader(true)
          // state.session.views[0]?.scrollTo(50000, 900000)
          state.session.views[0]?.showTrack(each.trackId)
        })
      })
    //@ts-ignore
  return <JbrowseWithState state={state} />
}

export default JbrowserWrapper

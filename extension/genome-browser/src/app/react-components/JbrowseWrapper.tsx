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

// Test trackID for tracks[1].trackID
const accName = "S.lyc LA2838A";




function JbrowserWrapper(props: JbrowseWrapperProps) {
  console.log('props', props);
  
  const accessionName = (props.location?.accession?.name || accName);
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


      if (accessionName){
        const accessionState = createViewState({
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
                  refName: accessionName,
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
        console.log("accession name:", accessionName);
        // create view state
        accessionState.assemblyManager.waitForAssembly(assembly.name).then(data => {
          console.log(data?.refNameAliases, 'awaited assembly');
          accessionState.session.addView('LinearGenomeView', {
            type: 'LinearGenomeView',
            id: '1',
            bpPerPx: props.location.accession?.binSize ?? 50000,
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
          console.log('added view', state.session.views.length);

          const accessionTrack = tracks.find(track => track.name == accessionName);
          if (accessionTrack){
            // state.session.views[0].horizontalScroll(-10)
            // state.session.views[0]?.setHideHeader(true)
            state.session.views[0]?.scrollTo(props.location.start)
            accessionState.session.views[0]?.showTrack(accessionTrack.trackId)
          }
          
        })
        return <JBrowseLinearGenomeView
          viewState={accessionState} />
      } else {
        state.assemblyManager.waitForAssembly(assembly.name).then(data => {
          console.log(data?.refNameAliases, 'awaited assembly');
          state.session.addView('LinearGenomeView', {
            type: 'LinearGenomeView',
            id: '1',
            bpPerPx: ((props.location?.binSize ?? 1) * (100 / (props.location?.zoomLevel ?? 100))),
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

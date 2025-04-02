import React from 'react';
import {
  createViewState,
  JBrowseLinearGenomeView,
} from '@jbrowse/react-linear-genome-view'
import assembly from './assembly';
import tracks from './tracks';
import config from './jbrowseConfig';

const JbrowseWithAccessionName = ({accessionName, location}:{ accessionName: string, location: any}) => {

    const accessionState = createViewState({
      assembly,
      tracks,
      defaultSession: {
        name: 'default session',
        view: {
          type: 'LinearGenomeView',
          id: '1',
          bpPerPx: location?.binSize ?? 50000,
          offsetPx: 0,
          displayedRegions: [
            {
              assemblyName: assembly.name,
              start: location?.start ?? 1,
              end: location?.end ?? 9500000,
              refName: accessionName,
            },
          ],
        },
      },
   
      configuration: config,
    })
    console.log("accession name:", accessionName);
    // create view state
    accessionState.assemblyManager.waitForAssembly(assembly.name).then(data => {
      console.log(data?.refNameAliases, 'awaited assembly');
      accessionState.session.addView('LinearGenomeView', {
        type: 'LinearGenomeView',
        id: '1',
        bpPerPx: location.accession?.binSize ?? 50000,
        offsetPx: 0,
        displayedRegions: [
          {
            assemblyName: assembly.name,
            start: location.start,
            end: location.end,
            refName: Object.keys(data?.refNameAliases!)[0],
          },
        ],
      })

      const accessionTrack = tracks.find(track => track.name == accessionName);
      if (accessionTrack){
        accessionState.session.views[0]?.scrollTo(location.start)
        accessionState.session.views[0]?.showTrack(accessionTrack.trackId)
      }
      
    })
    return <JBrowseLinearGenomeView
      viewState={accessionState} />
  
}

export default JbrowseWithAccessionName;
import React from 'react';
import {
  createViewState,
  JBrowseLinearGenomeView,
} from '@jbrowse/react-linear-genome-view'
import assembly from './assembly';
import tracks from './tracks';




function JbrowserWrapper({ name }: { name: string }) {
    const state = createViewState({
        assembly,
        tracks,
        location: '1:100,987,269..100,987,368',
      })
  return <JBrowseLinearGenomeView viewState={state} />
}

export default JbrowserWrapper

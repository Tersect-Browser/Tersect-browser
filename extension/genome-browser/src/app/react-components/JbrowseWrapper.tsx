import React from 'react';
import {
  createViewState,
  JBrowseLinearGenomeView,
  ViewModel
} from '@jbrowse/react-linear-genome-view'
import assembly from './assembly';
import tracks from './tracks';




function JbrowserWrapper(props: any) {

    const state = createViewState({
        assembly,
        tracks,
        location: '1:100,987,269..100,987,368',
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
            },
            components: {
              MuiPaper: {
                styleOverrides: {
                  root:{
                    boxShadow: "none"
                  }
                }
              }
            }
      
          }

        }
      })
  return <JBrowseLinearGenomeView   viewState={state} />
}

export default JbrowserWrapper

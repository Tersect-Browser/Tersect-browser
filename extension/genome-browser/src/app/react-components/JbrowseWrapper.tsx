import React, { useEffect, useRef, useLayoutEffect, useState } from 'react';
import {
  createViewState,
  JBrowseLinearGenomeView,
  ViewModel,
} from '@jbrowse/react-linear-genome-view';
import assembly from './assembly';
import tracks from './tracks';
import config from './jbrowseConfig';
import JbrowseWithAccessionName from './JbrowseWithAccession';
import { JbrowseWrapperProps } from '../../../../../common/JbrowseInterface';

function JbrowserWrapper(props: JbrowseWrapperProps) {
  const [initialized, setInitialized] = useState(false);
  const stateRef = useRef<ViewModel | null>(null);

  const location = props.location;

  // Early return for accession mode
  if (location?.accession?.name) {
    return (
      <JbrowseWithAccessionName
        accessionName={location.accession.name}
        location={location}
      />
    );
  }

  // Prevent initialization if required fields are missing
  if (!location?.defaultInterval || !location?.offsetCanvas) {
    return <div>Loading...</div>;
  }

  // Create state once
  useLayoutEffect(() => {
    if (!stateRef.current) {
      const initialState = createViewState({
        assembly,
        tracks,
        configuration: config,
        defaultSession: {
          name: 'default session',
          view: {
            type: 'LinearGenomeView',
            id: '1',
            bpPerPx: location.binSize ?? 1,
            offsetPx: 0,
            displayedRegions: [
              {
                assemblyName: assembly.name,
                refName: location.preselectedChromosome?.name ?? '',
                start: location.defaultInterval[0] ?? 0,
                end: location.defaultInterval[1] ?? 0,
              },
            ],
          },
        },
        
      });

      stateRef.current = initialState;

      // Wait for assembly, then add the view and tracks
      initialState.assemblyManager
        .waitForAssembly(assembly.name)
        .then(() => {
          // Remove any existing views
          if (initialState.session.views.length > 0) {
            initialState.session.removeView();
          }

          // Add a new view
          const view = initialState.session.addView('LinearGenomeView', {
            type: 'LinearGenomeView',
            id: '1',
            bpPerPx:
              (location.binSize ?? 1) * (100 / (location.zoomLevel ?? 1)),
            offsetPx: 0,
            displayedRegions: [
              {
                assemblyName: assembly.name,
                refName: location.chromosome?.name ?? '',
                start:
                  -(
                    (location.plotPositionX?.x ?? 0) *
                    (location.zoomLevel ?? 1) /
                    100
                  ) *
                  ((location.binSize ?? 1) *
                    (100 / (location.zoomLevel ?? 1))),
                end: location.selectedInterval?.[1] ?? 0,
                offset: -(props?.location?.offsetCanvas - 4),
              },
            ],
          });

          // Hide header and add first 3 tracks
          view.setHideHeader?.(true);
          
          tracks.slice(0, 3).forEach((track) =>
            view.showTrack(track.trackId)
          );
          if(view.initialized){
            view.horizontalScroll(-(props?.location?.offsetCanvas - 4));
          }
          
          setInitialized(true);
        });
    }
  }, [location]);

  useEffect(() => {
    const session = stateRef.current?.session;
    const view = session?.views[0];
    if (!session || !location.chromosome?.name) return;
    

  
    const bpPerPx = ((props.location?.binSize ?? 1) * (100 / (props.location?.zoomLevel ?? 1)));
    const start = ((-(props?.location?.plotPositionX.x * (props?.location.zoomLevel/100)) * (((props?.location?.binSize ?? 1) * (100 / (props?.location?.zoomLevel ?? 1))))) + props?.location?.selectedInterval?.[0]) 
    const end = props?.location?.selectedInterval?.[1] ?? 0;
    console.log('start-------', start, bpPerPx, end);

    if(view?.initialized){
      
      view.setNewView?.(bpPerPx,  start / bpPerPx);
      // view.setDisplayedRegions?.([
      //   {
      //     assemblyName: assembly.name,
      //     refName: location.chromosome.name,
      //     start: start,
      //     end: end,
          
      //   },
      // ]);
      // view.slide(start)
      view.horizontalScroll(-(props?.location?.offsetCanvas - 4));
    };
  }, [
    location.chromosome?.name,
    location.zoomLevel,
    location.plotPositionX?.x,
    location.offsetCanvas,
    location.selectedInterval,
    location.binSize,
    props?.location?.offsetCanvas,
    
  ]);
  
  

  // Sync scroll position or other layout-specific changes
  useLayoutEffect(() => {
    const view = stateRef.current?.session.views[0];
    if (view && location.offsetCanvas) {
      // view.setScrollX?.(-(location.offsetCanvas - 4));
    }
  }, [location.offsetCanvas]);

  if (!initialized || !stateRef.current) {
    return <div>Initializing genome browser...</div>;
  }

  return (
    <JBrowseLinearGenomeView
      key="jbrowse-view"
      viewState={stateRef.current}
    />
  );
}

export default JbrowserWrapper;

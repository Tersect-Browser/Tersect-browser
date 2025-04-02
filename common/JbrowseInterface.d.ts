export interface JbrowseWrapperProps {
    location: {
      start: number;
      end: number;
      zoomLevel?: number;
      pheneticWidth?: number;
      binSize?: number;
      accession?: {
        start: number;
        end: number;
        zoomLevel: number;
        pheneticWidth: number;
        binSize: number;
        name: string;
      }
    }
  }
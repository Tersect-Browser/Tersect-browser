import { Chromosome } from '../models/Chromosome';
import { AccessionDisplayStyle } from '../services/introgression-plot.service';

export interface AccessionDictionary {
    [internal_name: string]: string;
}

/**
 * Records the current state of the browser interface
 */
export interface BrowserSettings {
    dataset_id: string;
    selectedAccessionDisplayStyle?: AccessionDisplayStyle;
    accession_dictionary?: AccessionDictionary;
    selected_accessions?: string[];
    selected_reference?: string;
    selected_chromosome?: Chromosome;
    selected_interval?: number[];
    selected_binsize?: number;
    zoom_level?: number;
}

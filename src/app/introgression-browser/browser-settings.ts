import { Chromosome } from '../models/Chromosome';

export type AccessionDisplayStyle = 'labels' | 'tree_simple'
                                    | 'tree_linear';

export interface AccessionDictionary {
    [internal_name: string]: string;
}

export interface AccessionGroup {
    name: string;
    category?: string;
    color?: string;
    accessions: string[];
}

/**
 * Records the current state of the browser interface
 */
export interface BrowserSettings {
    dataset_id: string;
    accession_style?: AccessionDisplayStyle;
    accession_dictionary?: AccessionDictionary;
    selected_accessions?: string[];
    selected_reference?: string;
    selected_chromosome?: Chromosome;
    selected_interval?: number[];
    selected_binsize?: number;
    zoom_level?: number;
}

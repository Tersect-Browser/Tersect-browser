import { Chromosome } from '../models/Chromosome';

export type AccessionDisplayStyle = 'labels' | 'tree_simple'
                                    | 'tree_linear';

export interface AccessionDictionary {
    [internal_name: string]: {
        label: string;
        colors?: string[];
    };
}

export interface AccessionInfo {
    id?: string;
    Label?: string;
    [s: string]: string;
}

/**
 * Extract accession dictionary for quick lookup from accession info array.
 */
export function extractAccessionDictionary(infos: AccessionInfo[]): AccessionDictionary {
    const dict: AccessionDictionary = {};
    infos.forEach((info: AccessionInfo) => {
        dict[info.id] = {
            label: info.Label,
            colors: []
        };
    });
    return dict;
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
    accession_infos?: AccessionInfo[];
    accession_groups?: AccessionGroup[];
    selected_accessions?: string[];
    selected_reference?: string;
    selected_chromosome?: Chromosome;
    selected_interval?: number[];
    selected_binsize?: number;
    zoom_level?: number;
}

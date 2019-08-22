import { Chromosome } from '../models/Chromosome';
import { isNullOrUndefined } from 'util';

export type AccessionDisplayStyle = 'labels' | 'tree_simple'
                                    | 'tree_linear';

export interface AccessionDictionary {
    [internal_name: string]: {
        label?: string;
        colors?: string[];
    };
}

export interface AccessionInfo {
    id?: string;
    Label?: string;
    [s: string]: string;
}

/**
 * Extract accession label dictionary for quick lookup from accession info array.
 */
export function extractAccessionLabels(infos: AccessionInfo[]): AccessionDictionary {
    const dict: AccessionDictionary = {};
    infos.forEach((info: AccessionInfo) => {
        dict[info.id] = {
            label: info.Label
        };
    });
    return dict;
}

export function extractAccessionColors(groups: AccessionGroup[]): AccessionDictionary {
    const dict: AccessionDictionary = {};
    groups.filter((group: AccessionGroup) => !isNullOrUndefined(group.color))
          .forEach((group: AccessionGroup) => {
        group.accessions.forEach(acc_id => {
            if (!(acc_id in dict)) {
                dict[acc_id] = { colors: [group.color] };
            } else if ('colors' in dict[acc_id]) {
                dict[acc_id].colors.push(group.color);
            } else {
                dict[acc_id].colors = [group.color];
            }
        });
    });
    return dict;
}

/**
 * Merge accession dictionaries (e.g. label and color dictionaries).
 * Later (higher index) dictionaries overwrite the earlier (lower index) ones.
 */
export function mergeDictionaries(dicts: AccessionDictionary[]): AccessionDictionary {
    const output: AccessionDictionary = {};
    dicts.filter(dict => !isNullOrUndefined(dict))
         .forEach(dict => {
        Object.keys(dict).forEach(key => {
            output[key] = {...output[key], ...dict[key]};
        });
    });
    return output;
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

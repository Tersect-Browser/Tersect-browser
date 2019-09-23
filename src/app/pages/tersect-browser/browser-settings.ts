import { Chromosome } from '../../shared/models/Chromosome';
import { isNullOrUndefined } from '../../shared/utils/utils';

export type AccessionDisplayStyle = 'labels' | 'tree_simple' | 'tree_linear';

export interface AccessionDictionary {
    [accessionId: string]: {
        label?: string;
        colors?: string[];
    };
}

export interface AccessionGroup {
    name: string;
    category?: string;
    color?: string;
    accessions: string[];
}

export interface AccessionInfo {
    id: string;
    Label: string;
    [s: string]: string;
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
    plugins?: string[];
}

export function extractAccessionColors(groups: AccessionGroup[]): AccessionDictionary {
    const dict: AccessionDictionary = {};
    groups.filter((group: AccessionGroup) => !isNullOrUndefined(group.color))
          .forEach((group: AccessionGroup) => {
        group.accessions.forEach(accId => {
            if (!(accId in dict)) {
                dict[accId] = { colors: [group.color] };
            } else if ('colors' in dict[accId]) {
                dict[accId].colors.push(group.color);
            } else {
                dict[accId].colors = [group.color];
            }
        });
    });
    return dict;
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

export function getAccessionColors(accessionDictionary: AccessionDictionary,
                                   accession: string): string[] {
    if (isNullOrUndefined(accessionDictionary)) {
        return [];
    } else if (accession in accessionDictionary
               && 'colors' in accessionDictionary[accession]) {
        return accessionDictionary[accession].colors;
    } else {
        return [];
    }
}

/**
 * Get accession label from dictionary if available. Otherwise the input
 * identifier is used.
 */
export function getAccessionLabel(accessionDictionary: AccessionDictionary,
                                  accession: string): string {
    if (isNullOrUndefined(accessionDictionary)) {
        return accession;
    } else if (accession in accessionDictionary
               && 'label' in accessionDictionary[accession]) {
        return accessionDictionary[accession].label;
    } else {
        return accession;
    }
}

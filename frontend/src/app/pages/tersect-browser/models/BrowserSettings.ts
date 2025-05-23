import {
    AccessionDictionary,
    AccessionDisplayStyle,
    AccessionGroup,
    AccessionInfo
} from '../../../components/tersect-distance-plot/models/PlotState';
import {
    Chromosome
} from '../../../models/Chromosome';
import {
    isNullOrUndefined
} from '../../../utils/utils';

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

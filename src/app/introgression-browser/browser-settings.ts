import { Chromosome } from '../models/chromosome';
import { AccessionDisplayStyle } from '../services/introgression-plot.service';

/**
 * Records the current state of the browser interface
 */
export interface BrowserSettings {
    selectedAccessionDisplayStyle: AccessionDisplayStyle;
    selected_accessions: string[];
    selected_reference: string;
    selected_chromosome: Chromosome;
    selected_interval: number[];
    selected_binsize: number;
    zoom_level: number;
}

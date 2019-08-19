import { BrowserSettings, AccessionDictionary, AccessionDisplayStyle, AccessionGroup } from '../../introgression-browser/browser-settings';
import { sameElements, ceilTo, floorTo } from '../../utils/utils';
import { Chromosome } from '../../models/Chromosome';

import { Injectable } from '@angular/core';
import { BehaviorSubject ,  Subject } from 'rxjs';

@Injectable()
export class PlotStateService {
    private settings_source = new Subject<BrowserSettings>();
    settings$ = this.settings_source.asObservable();
    set settings(settings: BrowserSettings) {
        this.dataset_id = settings.dataset_id;
        this.accession_style = settings.accession_style;
        this.accession_dictionary = settings.accession_dictionary;
        this.accession_groups = settings.accession_groups;
        this.accessions = settings.selected_accessions;
        this.reference = settings.selected_reference;
        this.chromosome = settings.selected_chromosome;
        this.interval = settings.selected_interval;
        this.binsize = settings.selected_binsize;
        this.zoom_level = this.zoom_level;
        this.settings_source.next(settings);
    }
    get settings(): BrowserSettings {
        return {
            dataset_id: this.dataset_id,
            accession_style: this.accession_style,
            accession_dictionary: this.accession_dictionary,
            accession_groups: this.accession_groups,
            selected_accessions: this.accessions,
            selected_reference: this.reference,
            selected_chromosome: this.chromosome,
            selected_interval: this.interval,
            selected_binsize: this.binsize,
            zoom_level: this.zoom_level
        };
    }

    /**
     * Identifier of the dataset open in the introgression plot.
     */
    private dataset_id_source = new BehaviorSubject<string>(undefined);
    dataset_id$ = this.dataset_id_source.asObservable();
    set dataset_id(dataset_id) {
        this.dataset_id_source.next(dataset_id);
    }
    get dataset_id(): string {
        return this.dataset_id_source.getValue();
    }

    /**
     * Type of labels to draw - simple labels or phenetic tree.
     */
    private accession_style_source = new BehaviorSubject<AccessionDisplayStyle>('labels');
    accession_style$ = this.accession_style_source.asObservable();
    set accession_style(style: AccessionDisplayStyle) {
        if (style !== this.accession_style) {
            this.accession_style_source.next(style);
        }
    }
    get accession_style(): AccessionDisplayStyle {
        return this.accession_style_source.getValue();
    }

    /**
     * Dictionary of names to be used for accessions.
     */
    private accession_dictionary_source = new BehaviorSubject<AccessionDictionary>(undefined);
    accession_dictionary$ = this.accession_dictionary_source.asObservable();
    set accession_dictionary(accession_dictionary: AccessionDictionary) {
        this.accession_dictionary_source.next(accession_dictionary);
    }
    get accession_dictionary(): AccessionDictionary {
        return this.accession_dictionary_source.getValue();
    }

    /**
     * Accession groups and their associated colours.
     */
    private accession_groups_source = new BehaviorSubject<AccessionGroup[]>(undefined);
    accession_groups$ = this.accession_groups_source.asObservable();
    set accession_groups(accession_groups: AccessionGroup[]) {
        this.accession_groups_source.next(accession_groups);
    }
    get accession_groups(): AccessionGroup[] {
        return this.accession_groups_source.getValue();
    }

    /**
     * Accessions displayed in the plot.
     */
    private accessions_source = new BehaviorSubject<string[]>(undefined);
    accessions$ = this.accessions_source.asObservable();
    set accessions(accessions: string[]) {
        if (!sameElements(accessions, this.sorted_accessions)) {
            this.accessions_source.next(accessions);
        }
    }
    get accessions(): string[] {
        return this.accessions_source.getValue();
    }

    /**
     * Reference accession used by the plot.
     */
    private reference_source = new BehaviorSubject<string>(undefined);
    reference$ = this.reference_source.asObservable();
    set reference(reference: string) {
        this.reference_source.next(reference);
    }
    get reference(): string {
        return this.reference_source.getValue();
    }

    /**
     * Chromosome displayed by the plot.
     */
    private chromosome_source = new BehaviorSubject<Chromosome>(undefined);
    chromosome$ = this.chromosome_source.asObservable();
    set chromosome(chromosome: Chromosome) {
        this.chromosome_source.next(chromosome);
    }
    get chromosome(): Chromosome {
        return this.chromosome_source.getValue();
    }

    /**
     * Chromosomal interval displayed by the plot.
     */
    private interval_source = new BehaviorSubject<number[]>(undefined);
    interval$ = this.interval_source.asObservable();
    set interval(interval: number[]) {
        this.interval_source.next(interval);
    }
    get interval(): number[] {
        return this.interval_source.getValue();
    }

    /**
     * Bin size used by the plot.
     */
    private binsize_source = new BehaviorSubject<number>(undefined);
    binsize$ = this.binsize_source.asObservable();
    set binsize(binsize: number) {
        this.binsize_source.next(binsize);
    }
    get binsize(): number {
        return this.binsize_source.getValue();
    }

    /**
     * Zoom level in percentages.
     */
    private zoom_level_source = new BehaviorSubject<number>(100);
    zoom_level$ = this.zoom_level_source.asObservable();
    set zoom_level(zoom_level: number) {
        if (zoom_level !== this.zoom_level) {
            this.zoom_level_source.next(zoom_level);
        }
    }
    get zoom_level(): number {
        return this.zoom_level_source.getValue();
    }

    /**
     * Accession names (as used by tersect) sorted in the order to
     * be displayed on the drawn plot. Generally this is the order based on
     * the neighbor joining tree clustering.
     */
    sorted_accessions_source = new BehaviorSubject<string[]>(null);
    sorted_accessions$ = this.sorted_accessions_source.asObservable();
    set sorted_accessions(accessions: string[]) {
        this.sorted_accessions_source.next(accessions);
    }
    get sorted_accessions(): string[] {
        return this.sorted_accessions_source.getValue();
    }

    readonly MAX_ZOOM_LEVEL = 1000;
    readonly MIN_ZOOM_LEVEL = 100;
    readonly ZOOM_FACTOR = 1.3;
    readonly ZOOM_ROUND_TO = 50;

    zoomIn() {
        let zoom_level = this.zoom_level;
        zoom_level *= this.ZOOM_FACTOR;
        zoom_level = ceilTo(zoom_level, this.ZOOM_ROUND_TO);
        if (zoom_level > this.MAX_ZOOM_LEVEL) {
            zoom_level = this.MAX_ZOOM_LEVEL;
        }
        this.zoom_level = zoom_level;
    }

    zoomOut() {
        let zoom_level = this.zoom_level;
        zoom_level /= this.ZOOM_FACTOR;
        zoom_level = floorTo(zoom_level, this.ZOOM_ROUND_TO);
        if (zoom_level < this.MIN_ZOOM_LEVEL) {
            zoom_level = this.MIN_ZOOM_LEVEL;
        }
        this.zoom_level = zoom_level;
    }

    isZoomMax(): boolean {
        return this.zoom_level === this.MAX_ZOOM_LEVEL;
    }

    isZoomMin(): boolean {
        return this.zoom_level === this.MIN_ZOOM_LEVEL;
    }

}

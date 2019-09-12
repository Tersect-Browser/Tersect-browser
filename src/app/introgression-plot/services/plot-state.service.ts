import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';

import {
    AccessionDictionary,
    AccessionDisplayStyle,
    AccessionGroup,
    AccessionInfo,
    BrowserSettings,
    extractAccessionColors,
    extractAccessionLabels
} from '../../introgression-browser/browser-settings';
import {
    Chromosome
} from '../../models/Chromosome';
import {
    ceilTo,
    deepCopy,
    floorTo,
    isNullOrUndefined,
    sameElements
} from '../../utils/utils';

@Injectable()
export class PlotStateService {
    private readonly settingsSource = new Subject<BrowserSettings>();
    settings$ = this.settingsSource.asObservable();
    set settings(settings: BrowserSettings) {
        this.datasetId = settings.dataset_id;
        this.accessionStyle = settings.accession_style;
        this.accessionInfos = settings.accession_infos;
        this.accessionGroups = settings.accession_groups;
        this.accessions = settings.selected_accessions;
        this.reference = settings.selected_reference;
        this.chromosome = settings.selected_chromosome;
        this.interval = settings.selected_interval;
        this.binsize = settings.selected_binsize;
        this.zoomLevel = this.zoomLevel;
        this.plugins = settings.plugins;
        this.settingsSource.next(settings);
    }
    get settings(): BrowserSettings {
        return {
            dataset_id: this.datasetId,
            accession_style: this.accessionStyle,
            accession_infos: this.accessionInfos,
            accession_groups: this.accessionGroups,
            selected_accessions: this.accessions,
            selected_reference: this.reference,
            selected_chromosome: this.chromosome,
            selected_interval: this.interval,
            selected_binsize: this.binsize,
            zoom_level: this.zoomLevel,
            plugins: this.plugins
        };
    }

    /**
     * Identifier of the dataset open in the introgression plot.
     */
    private readonly datasetIdSource = new BehaviorSubject<string>(undefined);
    datasetId$ = this.datasetIdSource.asObservable();
    set datasetId(datasetId) {
        this.datasetIdSource.next(datasetId);
    }
    get datasetId(): string {
        return this.datasetIdSource.getValue();
    }

    /**
     * Type of labels to draw - simple labels or phenetic tree.
     */
    private readonly accessionStyleSource = new BehaviorSubject<AccessionDisplayStyle>('labels');
    accessionStyle$ = this.accessionStyleSource.asObservable();
    set accessionStyle(style: AccessionDisplayStyle) {
        if (style !== this.accessionStyle) {
            this.accessionStyleSource.next(style);
        }
    }
    get accessionStyle(): AccessionDisplayStyle {
        return this.accessionStyleSource.getValue();
    }

    private readonly accessionInfosSource = new BehaviorSubject<AccessionInfo[]>(undefined);
    accessionInfos$ = this.accessionInfosSource.asObservable();
    set accessionInfos(accessionInfos: AccessionInfo[]) {
        this.accessionInfosSource.next(accessionInfos);
        const labelDict = extractAccessionLabels(accessionInfos);
        const dict = !isNullOrUndefined(this.accessionDictionary)
                     ? deepCopy(this.accessionDictionary)
                     : {};
        Object.keys(labelDict).map(key => {
            if (key in dict) {
                dict[key].label = labelDict[key].label;
            } else {
                dict[key] = { label: labelDict[key].label };
            }
        });
        this.accessionDictionary = dict;
    }
    get accessionInfos(): AccessionInfo[] {
        return this.accessionInfosSource.getValue();
    }

    /**
     * Dictionary of names to be used for accessions.
     */
    private readonly accessionDictionarySource = new BehaviorSubject<AccessionDictionary>(undefined);
    accessionDictionary$ = this.accessionDictionarySource.asObservable();
    set accessionDictionary(dict: AccessionDictionary) {
        this.accessionDictionarySource.next(dict);
    }
    get accessionDictionary(): AccessionDictionary {
        return this.accessionDictionarySource.getValue();
    }

    /**
     * Accession groups and their associated colours.
     */
    private readonly accessionGroupsSource = new BehaviorSubject<AccessionGroup[]>(undefined);
    accessionGroups$ = this.accessionGroupsSource.asObservable();
    set accessionGroups(accessionGroups: AccessionGroup[]) {
        this.accessionGroupsSource.next(accessionGroups);
        const colorDict = extractAccessionColors(accessionGroups);
        if (isNullOrUndefined(this.accessionDictionary)) {
            this.accessionDictionary = deepCopy(colorDict);
        } else {
            Object.keys(this.accessionDictionary).map(key => {
                if (key in colorDict) {
                    this.accessionDictionary[key]
                        .colors = colorDict[key].colors;
                } else {
                    delete this.accessionDictionary[key].colors;
                }
            });
            this.accessionDictionary = {...this.accessionDictionary};
        }
    }
    get accessionGroups(): AccessionGroup[] {
        return this.accessionGroupsSource.getValue();
    }

    /**
     * Accessions displayed in the plot.
     */
    private readonly accessionsSource = new BehaviorSubject<string[]>(undefined);
    accessions$ = this.accessionsSource.asObservable();
    set accessions(accessions: string[]) {
        if (!sameElements(accessions, this.sortedAccessions)) {
            this.accessionsSource.next(accessions);
        }
    }
    get accessions(): string[] {
        return this.accessionsSource.getValue();
    }

    /**
     * Reference accession used by the plot.
     */
    private readonly referenceSource = new BehaviorSubject<string>(undefined);
    reference$ = this.referenceSource.asObservable();
    set reference(reference: string) {
        this.referenceSource.next(reference);
    }
    get reference(): string {
        return this.referenceSource.getValue();
    }

    /**
     * Chromosome displayed by the plot.
     */
    private readonly chromosomeSource = new BehaviorSubject<Chromosome>(undefined);
    chromosome$ = this.chromosomeSource.asObservable();
    set chromosome(chromosome: Chromosome) {
        this.chromosomeSource.next(chromosome);
    }
    get chromosome(): Chromosome {
        return this.chromosomeSource.getValue();
    }

    /**
     * Chromosomal interval displayed by the plot.
     */
    private readonly intervalSource = new BehaviorSubject<number[]>(undefined);
    interval$ = this.intervalSource.asObservable();
    set interval(interval: number[]) {
        this.intervalSource.next(interval);
    }
    get interval(): number[] {
        return this.intervalSource.getValue();
    }

    /**
     * Bin size used by the plot.
     */
    private readonly binsizeSource = new BehaviorSubject<number>(undefined);
    binsize$ = this.binsizeSource.asObservable();
    set binsize(binsize: number) {
        this.binsizeSource.next(binsize);
    }
    get binsize(): number {
        return this.binsizeSource.getValue();
    }

    /**
     * Zoom level in percentages.
     */
    private readonly zoomLevelSource = new BehaviorSubject<number>(100);
    zoomLevel$ = this.zoomLevelSource.asObservable();
    set zoomLevel(zoomLevel: number) {
        if (zoomLevel !== this.zoomLevel) {
            this.zoomLevelSource.next(zoomLevel);
        }
    }
    get zoomLevel(): number {
        return this.zoomLevelSource.getValue();
    }

    plugins: string[] = [];

    /**
     * Accession names (as used by tersect) sorted in the order to
     * be displayed on the drawn plot. Generally this is the order based on
     * the neighbor joining tree clustering.
     */
    sortedAccessionsSource = new BehaviorSubject<string[]>(null);
    sortedAccessions$ = this.sortedAccessionsSource.asObservable();
    set sortedAccessions(accessions: string[]) {
        this.sortedAccessionsSource.next(accessions);
    }
    get sortedAccessions(): string[] {
        return this.sortedAccessionsSource.getValue();
    }

    readonly MAX_ZOOM_LEVEL = 1000;
    readonly MIN_ZOOM_LEVEL = 100;
    readonly ZOOM_FACTOR = 1.3;
    readonly ZOOM_ROUND_TO = 50;

    zoomIn() {
        let zoomLevel = this.zoomLevel;
        zoomLevel *= this.ZOOM_FACTOR;
        zoomLevel = ceilTo(zoomLevel, this.ZOOM_ROUND_TO);
        if (zoomLevel > this.MAX_ZOOM_LEVEL) {
            zoomLevel = this.MAX_ZOOM_LEVEL;
        }
        this.zoomLevel = zoomLevel;
    }

    zoomOut() {
        let zoomLevel = this.zoomLevel;
        zoomLevel /= this.ZOOM_FACTOR;
        zoomLevel = floorTo(zoomLevel, this.ZOOM_ROUND_TO);
        if (zoomLevel < this.MIN_ZOOM_LEVEL) {
            zoomLevel = this.MIN_ZOOM_LEVEL;
        }
        this.zoomLevel = zoomLevel;
    }

    isZoomMax(): boolean {
        return this.zoomLevel === this.MAX_ZOOM_LEVEL;
    }

    isZoomMin(): boolean {
        return this.zoomLevel === this.MIN_ZOOM_LEVEL;
    }

}

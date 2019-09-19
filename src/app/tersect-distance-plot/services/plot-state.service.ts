import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';

import {
    Chromosome
} from '../../models/Chromosome';
import {
    PlotPosition
} from '../../models/Plot';
import {
    AccessionDictionary,
    AccessionDisplayStyle,
    AccessionGroup,
    AccessionInfo,
    BrowserSettings,
    extractAccessionColors,
    extractAccessionLabels
} from '../../tersect-browser/browser-settings';
import {
    deepCopy,
    isNullOrUndefined,
    sameElements
} from '../../utils/utils';
import {
    PlotState
} from '../models/PlotState';

@Injectable()
export class PlotStateService implements PlotState {
    settings$: Observable<BrowserSettings>;

    /**
     * Identifier of the dataset open in the distance plot.
     */
    datasetId$: Observable<string>;

    /**
     * Type of labels to draw - simple labels or phenetic tree.
     */
    accessionStyle$: Observable<AccessionDisplayStyle>;

    accessionInfos$: Observable<AccessionInfo[]>;

    /**
     * Dictionary of names to be used for accessions.
     */
    accessionDictionary$: Observable<AccessionDictionary>;

    accessionGroups$: Observable<AccessionGroup[]>;

    /**
     * Accessions displayed in the plot.
     */
    accessions$: Observable<string[]>;

    /**
     * Reference accession used by the plot.
     */
    reference$: Observable<string>;

    /**
     * Chromosome displayed by the plot.
     */
    chromosome$: Observable<Chromosome>;

    /**
     * Chromosomal interval displayed by the plot.
     */
    interval$: Observable<number[]>;

    /**
     * Bin size used by the plot.
     */
    binsize$: Observable<number>;

    /**
     * Zoom level in percentages.
     */
    zoomLevel$: Observable<number>;

    plugins: string[] = [];

    /**
     * Horizontal / vertical scroll position (in terms of bins and accessions,
     * respectively) of the plot.
     */
    plotPositionSource = new BehaviorSubject<PlotPosition>({ x: 0, y: 0 });

    /**
     * Accession names in the order to be displayed on the drawn plot.
     * Generally this is the order based on clustering.
     */
    orderedAccessions$: Observable<string[]>;

    private readonly settingsSource = new Subject<BrowserSettings>();
    private readonly datasetIdSource = new BehaviorSubject<string>(undefined);
    private readonly accessionStyleSource = new BehaviorSubject<AccessionDisplayStyle>('labels');
    private readonly accessionInfosSource = new BehaviorSubject<AccessionInfo[]>(undefined);
    private readonly accessionDictionarySource = new BehaviorSubject<AccessionDictionary>(undefined);
    private readonly accessionGroupsSource = new BehaviorSubject<AccessionGroup[]>(undefined);
    private readonly accessionsSource = new BehaviorSubject<string[]>(undefined);
    private readonly referenceSource = new BehaviorSubject<string>(undefined);
    private readonly chromosomeSource = new BehaviorSubject<Chromosome>(undefined);
    private readonly intervalSource = new BehaviorSubject<number[]>(undefined);
    private readonly binsizeSource = new BehaviorSubject<number>(undefined);
    private readonly zoomLevelSource = new BehaviorSubject<number>(100);
    private readonly orderedAccessionsSource = new BehaviorSubject<string[]>(null);

    constructor() {
        this.settings$ = this.settingsSource.asObservable();
        this.datasetId$ = this.datasetIdSource.asObservable();
        this.accessionStyle$ = this.accessionStyleSource.asObservable();
        this.accessionInfos$ = this.accessionInfosSource.asObservable();
        this.accessionDictionary$ = this.accessionDictionarySource.asObservable();
        this.accessionGroups$ = this.accessionGroupsSource.asObservable();
        this.accessions$ = this.accessionsSource.asObservable();
        this.reference$ = this.referenceSource.asObservable();
        this.chromosome$ = this.chromosomeSource.asObservable();
        this.interval$ = this.intervalSource.asObservable();
        this.binsize$ = this.binsizeSource.asObservable();
        this.zoomLevel$ = this.zoomLevelSource.asObservable();
        this.orderedAccessions$ = this.orderedAccessionsSource.asObservable();
    }

    get plotPosition(): PlotPosition {
        return this.plotPositionSource.getValue();
    }

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

    set datasetId(datasetId) {
        this.datasetIdSource.next(datasetId);
    }
    get datasetId(): string {
        return this.datasetIdSource.getValue();
    }

    set accessionStyle(style: AccessionDisplayStyle) {
        if (style !== this.accessionStyle) {
            this.accessionStyleSource.next(style);
        }
    }
    get accessionStyle(): AccessionDisplayStyle {
        return this.accessionStyleSource.getValue();
    }

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

    set accessionDictionary(dict: AccessionDictionary) {
        this.accessionDictionarySource.next(dict);
    }
    get accessionDictionary(): AccessionDictionary {
        return this.accessionDictionarySource.getValue();
    }

    /**
     * Accession groups and their associated colours.
     */
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

    set accessions(accessions: string[]) {
        if (!sameElements(accessions, this.orderedAccessions)) {
            this.accessionsSource.next(accessions);
        }
    }
    get accessions(): string[] {
        return this.accessionsSource.getValue();
    }

    set reference(reference: string) {
        this.referenceSource.next(reference);
    }
    get reference(): string {
        return this.referenceSource.getValue();
    }

    set chromosome(chromosome: Chromosome) {
        this.chromosomeSource.next(chromosome);
    }
    get chromosome(): Chromosome {
        return this.chromosomeSource.getValue();
    }

    set interval(interval: number[]) {
        this.intervalSource.next(interval);
    }
    get interval(): number[] {
        return this.intervalSource.getValue();
    }

    set binsize(binsize: number) {
        this.binsizeSource.next(binsize);
    }
    get binsize(): number {
        return this.binsizeSource.getValue();
    }

    set zoomLevel(zoomLevel: number) {
        if (zoomLevel !== this.zoomLevel) {
            this.zoomLevelSource.next(zoomLevel);
        }
    }
    get zoomLevel(): number {
        return this.zoomLevelSource.getValue();
    }

    set orderedAccessions(accessions: string[]) {
        this.orderedAccessionsSource.next(accessions);
    }
    get orderedAccessions(): string[] {
        return this.orderedAccessionsSource.getValue();
    }

    resetPosition() {
        this.plotPositionSource.next({ x: 0, y: 0 });
    }

    updatePosition(pos: PlotPosition) {
        this.plotPositionSource.next(pos);
    }
}

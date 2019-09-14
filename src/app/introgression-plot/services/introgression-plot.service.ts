import { Injectable, OnDestroy } from '@angular/core';

import * as deepEqual from 'fast-deep-equal';
import {
    BehaviorSubject,
    combineLatest,
    Observable,
    Subscription
} from 'rxjs';
import {
    debounceTime,
    delay,
    filter,
    first,
    retryWhen,
    switchMap,
    tap
} from 'rxjs/operators';

import {
    PheneticTree
} from '../../../backend/models/phenetictree';
import {
    TreeNode,
    treeToSortedList
} from '../../clustering/clustering';
import {
    parseNewick
} from '../../clustering/newick-parser';
import {
    Position
} from '../../models/Plot';
import {
    SequenceInterval
} from '../../models/SequenceInterval';
import {
    TreeQuery
} from '../../models/TreeQuery';
import {
    TersectBackendService
} from '../../services/tersect-backend.service';
import {
    ceilTo,
    floorTo,
    formatRegion,
    isNullOrUndefined,
    sameElements
} from '../../utils/utils';
import {
    GreyscalePalette
} from '../DistancePalette';
import {
    PlotStateService
} from './plot-state.service';

export interface GUIMargins {
    top: number;
    right: number;
    bottom: number;
    left: number;
}

@Injectable()
export class IntrogressionPlotService implements OnDestroy {
    static readonly DEBOUNCE_TIME = 700;
    static readonly DEFAULT_LOAD_MESSAGE = 'Loading...';

    // R, G, B, A color
    static readonly GAP_COLOR = [240, 180, 180, 255];

    /**
     * Default top bar size.
     */
    static readonly GUI_SCALE_BAR_SIZE = 24;

    static readonly TREE_RETRY_DELAY = 1000;

    /**
     * Bin aspect ratio (width / height). By default bins are twice as high as
     * they are wide. This is to more easily fit accession labels without making
     * the plot too wide.
     */
    aspectRatio = 1 / 2;

    /**
     * Error message string. When not an empty string, error message overlay is
     * displayed.
     */
    errorMessage = '';

    guiMargins: GUIMargins = {
        top: IntrogressionPlotService.GUI_SCALE_BAR_SIZE,
        right: 0,
        bottom: 0,
        left: 0
    };

    /**
     * Highlighted area of the plot.
     */
    highlightSource = new BehaviorSubject<SequenceInterval>(undefined);

    /**
     * Phenetic tree built for the selected accessions (specified in query).
     */
    phenTree: {
        query: TreeQuery
        tree: TreeNode
    } = { query: null, tree: null };

    plotArraySource = new BehaviorSubject<Uint8ClampedArray>(null);

    /**
     * Plot load status. When not an empty string, spinner overlay is displayed
     * (unless an error message is displayed, as those take priority).
     */
    plotLoadMessage = '';

    /**
     * Horizontal / vertical scroll position (in terms of bins) of the plot.
     */
    plotPositionSource = new BehaviorSubject<Position>({ x: 0, y: 0 });

    /**
     * Genetic distance bins between reference and other accessions for
     * currently viewed interval, fetched from tersect.
     */
    private distanceBins = {};

    private readonly plotData$: Observable<any[]>;
    private plotDataSub: Subscription;

    /**
     * List of sequence gaps in the current chromosome.
     */
    private sequenceGaps: SequenceInterval[];

    constructor(private readonly plotState: PlotStateService,
                private readonly tersectBackendService: TersectBackendService) {
        const accessions$ = this.getAccessions$();
        const refDistanceBins$ = this.getRefDistanceBins$(accessions$);
        const phenTree$ = this.getPhenTree$(accessions$);
        const gaps$ = this.getGaps$();

        this.plotData$ = this.getPlotData$(refDistanceBins$, phenTree$, gaps$);

        this.plotState.settings$.pipe(first()).subscribe(() => {
            // Subscribe to plot data updates once settings are loaded
            this.plotDataSub = this.plotData$.subscribe(this.generatePlot);
        });
    }

    /**
     * Width of accession label / tree area in pixels.
     */
    get accessionBarWidth() {
        return this.guiMargins.left * this.zoomFactor;
    }

    get binHeight() {
        return this.zoomFactor / this.aspectRatio;
    }

    get binWidth() {
        return this.zoomFactor;
    }

    get colNum(): number {
        return this.distanceBins[this.plotState.sortedAccessions[0]].length;
    }

    set highlight(highlightInterval: SequenceInterval) {
        this.highlightSource.next(highlightInterval);
    }
    get highlight(): SequenceInterval {
        return this.highlightSource.getValue();
    }

    /**
     * Horizontal offset / position of the plot in terms of pixels
     */
    get offsetX() {
        return ceilTo(this.plotPosition.x * this.binWidth, this.binWidth);
    }

    /**
     * Vertical offset / position of the plot in terms of pixels
     */
    get offsetY() {
        return ceilTo(this.plotPosition.y * this.binHeight, this.binHeight);
    }

    get plotArray() {
        return this.plotArraySource.getValue();
    }

    get plotPosition() {
        return this.plotPositionSource.getValue();
    }

    get rowNum(): number {
        return this.plotState.sortedAccessions.length;
    }

    get zoomFactor(): number {
        return this.plotState.zoomLevel / 100;
    }

    ngOnDestroy() {
        if (!isNullOrUndefined(this.plotDataSub)) {
            this.plotDataSub.unsubscribe();
        }
    }

    getAccessionColors(accession: string): string[] {
        if (isNullOrUndefined(this.plotState.accessionDictionary)) {
            return [];
        } else if (accession in this.plotState.accessionDictionary
                   && 'colors' in this.plotState.accessionDictionary[accession]) {
            return this.plotState.accessionDictionary[accession].colors;
        } else {
            return [];
        }
    }

    /**
     * Get accession label from dictionary if available. Otherwise the input
     * identifier is used.
     */
    getAccessionLabel(accession: string): string {
        if (isNullOrUndefined(this.plotState.accessionDictionary)) {
            return accession;
        } else if (accession in this.plotState.accessionDictionary
                   && 'label' in this.plotState.accessionDictionary[accession]) {
            return this.plotState.accessionDictionary[accession].label;
        } else {
            return accession;
        }
    }

    /**
     * Return highest number of colors assigned to an accession.
     */
    getMaxColorCount(): number {
        let count = 0;
        Object.values(this.plotState.accessionDictionary).forEach(acc => {
            if ('colors' in acc && acc.colors.length > count) {
                count = acc.colors.length;
            }
        });
        return count;
    }

    updatePosition(pos: Position) {
        this.plotPositionSource.next(pos);
    }

    private addPlotGap(plotArray: Uint8ClampedArray, gap: SequenceInterval) {
        const rowNum = this.rowNum;
        const colNum = this.colNum;
        const interval = this.plotState.interval;
        const startPos = gap.start > interval[0] ? gap.start : interval[0];
        const endPos = gap.end < interval[1] ? gap.end : interval[1];
        const binStart = ceilTo(startPos - interval[0],
                                this.plotState.binsize)
                         / this.plotState.binsize;
        // NOTE: bin_end index is exclusive while gap.end position is inclusive
        const binEnd = floorTo(endPos - interval[0] + 1,
                                this.plotState.binsize)
                        / this.plotState.binsize;
        for (let accessionIndex = 0;
                 accessionIndex < rowNum;
                 accessionIndex++) {
            for (let binIndex = binStart; binIndex < binEnd; binIndex++) {
                const pos = 4 * (binIndex + colNum * accessionIndex);
                plotArray[pos] = IntrogressionPlotService.GAP_COLOR[0];
                plotArray[pos + 1] = IntrogressionPlotService.GAP_COLOR[1];
                plotArray[pos + 2] = IntrogressionPlotService.GAP_COLOR[2];
                plotArray[pos + 3] = IntrogressionPlotService.GAP_COLOR[3];
            }
        }
    }

    /**
     * Add gaps to existing plot array.
     */
    private addPlotGaps(plotArray: Uint8ClampedArray) {
        this.sequenceGaps.forEach(gap => {
            if (gap.size >= this.plotState.binsize) {
                this.addPlotGap(plotArray, gap);
            }
        });
    }

    /**
     * Verify if reference distance bins match the tree in terms of chromosome
     * region and included accessions used.
     */
    private binsMatchTree(refDist: any, treeOutput: PheneticTree): boolean {
        const treeRegion = formatRegion(treeOutput.query.chromosome_name,
                                        treeOutput.query.interval[0],
                                        treeOutput.query.interval[1]);
        const regionMatch = refDist['region'] === treeRegion
                            && (refDist['region'].split(':')[0]
                               === this.plotState.chromosome.name)
                            && refDist['reference']
                               === this.plotState.reference;
        if (!regionMatch) {
            return false;
        }
        return sameElements(Object.keys(refDist['bins']),
                            treeOutput.query.accessions);
    }

    private generatePlotArray() {
        const palette = new GreyscalePalette();
        const accessionBins = this.plotState.sortedAccessions.map(
            accession => this.distanceBins[accession]
        );

        const binMaxDistances = this.getMaxDistances(accessionBins);

        const rowNum = this.rowNum;
        const colNum = this.colNum;
        const plotArray = new Uint8ClampedArray(4 * rowNum * colNum);

        accessionBins.forEach((accessionBin, accessionIndex) => {
            palette.distanceToColors(accessionBin, binMaxDistances)
                   .forEach((color, binIndex) => {
                const pos = 4 * (binIndex + colNum * accessionIndex);
                plotArray[pos] = color.data[0];
                plotArray[pos + 1] = color.data[1];
                plotArray[pos + 2] = color.data[2];
                plotArray[pos + 3] = color.data[3];
            });
        });

        this.addPlotGaps(plotArray);
        this.plotArraySource.next(plotArray);
    }

    private getAccessions$(): Observable<string[]> {
        return this.plotState.accessions$.pipe(
            filter(accessions => !isNullOrUndefined(accessions)),
            filter(this.validateInputs),
            tap(this.startLoading),
            debounceTime(IntrogressionPlotService.DEBOUNCE_TIME)
        );
    }

    private getGaps$(): Observable<SequenceInterval[]> {
        return combineLatest([
            this.plotState.datasetId$,
            this.plotState.chromosome$
        ]).pipe(
            filter(inputs => !inputs.some(isNullOrUndefined)),
            tap(this.startLoading),
            debounceTime(IntrogressionPlotService.DEBOUNCE_TIME),
            switchMap(([datasetId, chrom]) => this.tersectBackendService
                                                  .getGapIndex(datasetId,
                                                               chrom.name))
        );
    }

    /**
     * Get an array of maximum distances per bin for a given set of accessions.
     */
    private getMaxDistances(accessionBins: number[][]): number[] {
        const binMaxDistances = new Array(accessionBins[0].length).fill(0);
        accessionBins.forEach(accBin => {
            accBin.forEach((dist, i) => {
                if (dist > binMaxDistances[i]) {
                    binMaxDistances[i] = dist;
                }
            });
        });
        return binMaxDistances;
    }

    private getPhenTree$(accessions$: Observable<string[]>): Observable<PheneticTree> {
        return combineLatest([
            this.plotState.datasetId$,
            this.plotState.chromosome$,
            this.plotState.interval$,
            accessions$,
            this.plotState.binsize$
        ]).pipe(
            filter(inputs => !inputs.some(isNullOrUndefined)),
            filter(this.validateInputs),
            filter(this.isTreeUpdateRequired),
            tap(this.startLoading),
            debounceTime(IntrogressionPlotService.DEBOUNCE_TIME),
            switchMap(([datasetId, chrom, interval, accessions]) =>
                this.tersectBackendService
                    .getPheneticTree(datasetId, chrom.name,
                                     interval[0], interval[1],
                                     accessions).pipe(
                    tap((treeOutput: PheneticTree) => {
                        if (treeOutput.status !== 'ready') {
                            this.plotLoadMessage = treeOutput.status;
                            throw new Error('Tree still loading');
                        }
                    }),
                    retryWhen(errors => {
                        return errors.pipe(
                            delay(IntrogressionPlotService.TREE_RETRY_DELAY)
                        );
                    })
                )
            )
        );
    }

    private getPlotData$(refDistanceBins$: Observable<any>,
                         phenTree$: Observable<PheneticTree>,
                         gaps$: Observable<SequenceInterval[]>): Observable<any[]> {
        return combineLatest([
            refDistanceBins$,
            phenTree$,
            gaps$
        ]).pipe(
            filter(inputs => !inputs.some(isNullOrUndefined)),
            tap(this.startLoading),
            filter(([refDist, treeOutput]) => this.binsMatchTree(refDist,
                                                                 treeOutput))
        );
    }

    private getRefDistanceBins$(accessions$: Observable<string[]>): Observable<any> {
        return combineLatest([
            this.plotState.datasetId$,
            this.plotState.reference$,
            this.plotState.chromosome$,
            this.plotState.interval$,
            this.plotState.binsize$,
            accessions$
        ]).pipe(
            filter(inputs => !inputs.some(isNullOrUndefined)),
            filter(this.validateInputs),
            tap(this.startLoading),
            debounceTime(IntrogressionPlotService.DEBOUNCE_TIME),
            switchMap(([datasetId, ref, chrom, interval, binsize, accs]) =>
                this.tersectBackendService
                    .getRefDistanceBins(datasetId, ref, chrom.name,
                                        interval[0], interval[1], binsize, accs)
            )
        );
    }

    private resetPosition() {
        this.plotPositionSource.next({ x: 0, y: 0 });
    }

    private readonly generatePlot = ([refDist, treeOutput, gaps]) => {
        this.distanceBins = refDist['bins'];
        if (!deepEqual(this.phenTree.query, treeOutput.query)) {
            // Tree updated
            this.phenTree = {
                query: treeOutput.query,
                tree: parseNewick(treeOutput.tree_newick, true)
            };
            this.plotState
                .sortedAccessions = treeToSortedList(this.phenTree.tree);
            this.sequenceGaps = gaps;
            this.generatePlotArray();
            this.resetPosition();
        } else {
            // Only distances to reference updated
            this.generatePlotArray();
        }
        this.stopLoading();
    }

    /**
     * Check if a new phenetic tree needs to be retrieved due to either no
     * tree being stored or the query changing.
     */
    private readonly isTreeUpdateRequired = () => {
        if (isNullOrUndefined(this.phenTree.tree)
            || isNullOrUndefined(this.phenTree.query)) {
            return true;
        }
        const currentQuery: TreeQuery = {
            chromosome_name: this.plotState.chromosome.name,
            interval: this.plotState.interval,
            accessions: this.plotState.accessions
        };
        return !deepEqual(this.phenTree.query, currentQuery);
    }

    private readonly startLoading = () => {
        if (this.plotLoadMessage === '') {
            this.plotLoadMessage = IntrogressionPlotService.DEFAULT_LOAD_MESSAGE;
        }
    }

    private readonly stopLoading = () => {
        this.plotLoadMessage = '';
    }

    private readonly validateInputs = () => {
        if (!isNullOrUndefined(this.plotState.accessions)
            && this.plotState.accessions.length < 2) {
            this.errorMessage = 'At least two accessions must be selected';
            return false;
        }
        const interval = this.plotState.interval;
        if (isNullOrUndefined(interval)
            || isNaN(parseInt(interval[0].toString(), 10))
            || isNaN(parseInt(interval[1].toString(), 10))
            || interval[1] - interval[0] < this.plotState.binsize) {
            this.errorMessage = 'Invalid interval';
            return false;
        }
        this.errorMessage = '';
        return true;
    }
}

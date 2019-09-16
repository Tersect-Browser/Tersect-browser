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
    distinctUntilChanged,
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
    treeToOrderedList
} from '../../clustering/clustering';
import {
    parseNewick
} from '../../clustering/newick-parser';
import {
    Chromosome
} from '../../models/Chromosome';
import {
    DistanceBins
} from '../../models/DistanceBins';
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
    isNullOrUndefined,
    sameElements
} from '../../utils/utils';
import {
    PlotStateService
} from './plot-state.service';

export interface GUIMargins {
    top: number;
    right: number;
    bottom: number;
    left: number;
}

type PlotData = [DistanceBins, PheneticTree, SequenceInterval[]];

@Injectable()
export class PlotCreatorService implements OnDestroy {
    static readonly DEBOUNCE_TIME = 700;
    static readonly DEFAULT_LOAD_MESSAGE = 'Loading...';

    static readonly ERROR_MESSAGE_ACCESSIONS = 'At least two accessions must be selected';
    static readonly ERROR_MESSAGE_BINSIZE = 'Bin size must be smaller than the selected interval';

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
     * Genetic distance bins between reference and other accessions for
     * currently viewed interval.
     */
    distanceBinsSource = new BehaviorSubject<DistanceBins>(undefined);

    /**
     * Set of currently active error messages.
     */
    errorMessages: Set<string> = new Set();

    guiMargins: GUIMargins = {
        top: PlotCreatorService.GUI_SCALE_BAR_SIZE,
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
    pheneticTree: {
        query: TreeQuery
        tree: TreeNode
    } = { query: null, tree: null };

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
     * List of sequence gaps in the current chromosome.
     */
    sequenceGaps: SequenceInterval[];

    private readonly plotData$: Observable<PlotData>;
    private plotDataSub: Subscription;

    constructor(private readonly plotState: PlotStateService,
                private readonly tersectBackendService: TersectBackendService) {
        const distanceBins$ = this.getDistanceBins$();
        const pheneticTree$ = this.getPheneticTree$();
        const gaps$ = this.getGaps$();

        this.plotData$ = this.getPlotData$(distanceBins$, pheneticTree$, gaps$);

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
        // The number of bins is the same for all accessions
        const acc = this.plotState.orderedAccessions[0];
        return this.distanceBins.bins[acc].length;
    }

    set distanceBins(distanceBins: DistanceBins) {
        this.distanceBinsSource.next(distanceBins);
    }
    get distanceBins(): DistanceBins {
        return this.distanceBinsSource.getValue();
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

    get plotPosition() {
        return this.plotPositionSource.getValue();
    }

    get rowNum(): number {
        return this.plotState.orderedAccessions.length;
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

    startLoading() {
        if (this.plotLoadMessage === '') {
            this.plotLoadMessage = PlotCreatorService.DEFAULT_LOAD_MESSAGE;
        }
    }

    stopLoading() {
        this.plotLoadMessage = '';
    }

    updatePosition(pos: Position) {
        this.plotPositionSource.next(pos);
    }

    /**
     * Verify if reference distance bins match the tree and the plot state
     * in terms of chromosome region and included accessions used.
     */
    private binsMatchTree(distBins: DistanceBins, tree: PheneticTree): boolean {
        return distBins.query.chromosome_name === tree.query.chromosome_name
               && distBins.query.chromosome_name === this.plotState.chromosome.name
               && distBins.query.interval[0] === tree.query.interval[0]
               && distBins.query.interval[1] === tree.query.interval[1]
               && distBins.query.reference === this.plotState.reference
               && sameElements(distBins.query.accessions,
                               tree.query.accessions);
    }

    private getGaps$(): Observable<SequenceInterval[]> {
        return combineLatest([
            this.plotState.datasetId$,
            this.plotState.chromosome$
        ]).pipe(
            filter(inputs => !inputs.some(isNullOrUndefined)),
            tap(() => this.startLoading()),
            debounceTime(PlotCreatorService.DEBOUNCE_TIME),
            switchMap(([datasetId, chrom]) => this.tersectBackendService
                                                  .getChromosomeGaps(datasetId,
                                                                     chrom.name))
        );
    }

    private getPheneticTree$(): Observable<PheneticTree> {
        return combineLatest([
            this.plotState.datasetId$,
            this.plotState.chromosome$,
            this.plotState.interval$,
            this.plotState.accessions$
        ]).pipe(
            filter(inputs => !inputs.some(isNullOrUndefined)),
            filter(inputs => this.validateTreeInputs(...inputs)),
            distinctUntilChanged(deepEqual),
            tap(() => this.startLoading()),
            debounceTime(PlotCreatorService.DEBOUNCE_TIME),
            switchMap(([datasetId, chrom, interval, accessions]) =>
                this.tersectBackendService
                    .getPheneticTree(datasetId, chrom.name,
                                     interval[0], interval[1],
                                     accessions).pipe(
                    tap((tree: PheneticTree) => {
                        if (tree.status !== 'ready') {
                            this.plotLoadMessage = tree.status;
                            throw new Error('Tree still loading');
                        }
                    }),
                    retryWhen(errors => {
                        return errors.pipe(
                            delay(PlotCreatorService.TREE_RETRY_DELAY)
                        );
                    })
                )
            )
        );
    }

    private getPlotData$(distanceBins$: Observable<DistanceBins>,
                         pheneticTree$: Observable<PheneticTree>,
                         gaps$: Observable<SequenceInterval[]>): Observable<PlotData> {
        return combineLatest([
            distanceBins$,
            pheneticTree$,
            gaps$
        ]).pipe(
            filter(inputs => !inputs.some(isNullOrUndefined)),
            tap(() => this.startLoading()),
            filter(([distBins, tree]) => this.binsMatchTree(distBins, tree))
        );
    }

    private getDistanceBins$(): Observable<DistanceBins> {
        return combineLatest([
            this.plotState.datasetId$,
            this.plotState.reference$,
            this.plotState.chromosome$,
            this.plotState.interval$,
            this.plotState.binsize$,
            this.plotState.accessions$
        ]).pipe(
            filter(inputs => !inputs.some(isNullOrUndefined)),
            filter(inputs => this.validateBinInputs(...inputs)),
            distinctUntilChanged(deepEqual),
            tap(() => this.startLoading()),
            debounceTime(PlotCreatorService.DEBOUNCE_TIME),
            switchMap(([datasetId, ref, chrom, interval, binsize, accs]) =>
                this.tersectBackendService
                    .getDistanceBins(datasetId, ref, chrom.name,
                                     interval[0], interval[1],
                                     binsize, accs)
            )
        );
    }

    private resetPosition() {
        this.plotPositionSource.next({ x: 0, y: 0 });
    }

    private validateAccessions(accessions: string[]): boolean {
        if (accessions.length < 2) {
            this.errorMessages
                .add(PlotCreatorService.ERROR_MESSAGE_ACCESSIONS);
            return false;
        } else {
            this.errorMessages
                .delete(PlotCreatorService.ERROR_MESSAGE_ACCESSIONS);
            return true;
        }
    }

    private validateBinInputs(datasetId: string,
                              reference: string,
                              chromosome: Chromosome,
                              interval: number[],
                              binsize: number,
                              accessions: string[]): boolean {
        const valAccessions = this.validateAccessions(accessions);
        const valBinsize = this.validateBinsize(binsize, interval);
        return valAccessions && valBinsize;
    }

    private validateBinsize(binsize: number, interval: number[]) {
        if (isNullOrUndefined(interval)
            || isNaN(parseInt(interval[0].toString(), 10))
            || isNaN(parseInt(interval[1].toString(), 10))
            || interval[1] - interval[0] < binsize) {
            this.errorMessages
                .add(PlotCreatorService.ERROR_MESSAGE_BINSIZE);
            return false;
        } else {
            this.errorMessages
                .delete(PlotCreatorService.ERROR_MESSAGE_BINSIZE);
            return true;
        }
    }

    private validateTreeInputs(datasetId: string,
                               chromosome: Chromosome,
                               interval: number[],
                               accessions: string[]): boolean {
        return this.validateAccessions(accessions);
    }

    private readonly generatePlot = ([distBins, tree, gaps]: PlotData) => {
        if (!deepEqual(this.pheneticTree.query, tree.query)) {
            // Tree updated
            this.pheneticTree = {
                query: tree.query,
                tree: parseNewick(tree.tree_newick, true)
            };
            this.plotState
                .orderedAccessions = treeToOrderedList(this.pheneticTree.tree);
            // Technically the gaps are not expected to change
            this.sequenceGaps = gaps;
            this.resetPosition();
        }
        this.distanceBins = distBins;
    }
}

import { Injectable } from '@angular/core';
import { PlotPosition } from '../../models/PlotPosition';
import { TreeNode, treeToSortedList } from '../../clustering/clustering';
import { BehaviorSubject } from 'rxjs/BehaviorSubject';
import { TersectBackendService } from '../../services/tersect-backend.service';
import { combineLatest } from 'rxjs/observable/combineLatest';
import { filter, tap, debounceTime, switchMap } from 'rxjs/operators';
import { isNullOrUndefined } from 'util';
import { sameElements, ceilTo, floorTo, formatRegion } from '../../utils/utils';
import { GreyscalePalette } from '../DistancePalette';
import { SequenceInterval } from '../../models/SequenceInterval';
import { TreeQuery } from '../../models/TreeQuery';

import * as deepEqual from 'fast-deep-equal';
import { PlotStateService } from './plot-state.service';
import { Observable } from 'rxjs/Observable';

export interface GUIMargins {
    top: number;
    right: number;
    bottom: number;
    left: number;
}

export type AccessionDisplayStyle = 'labels' | 'tree_simple'
                                    | 'tree_linear';

@Injectable()
export class IntrogressionPlotService {
    /**
     * Default top bar size.
     */
    readonly GUI_SCALE_BAR_SIZE = 24;

    readonly DEBOUNCE_TIME = 700;

    // R, G, B, A color
    readonly GAP_COLOR = [240, 180, 180, 255];

    /**
     * Bin aspect ratio (width / height). By default bins are twice as high as
     * they are wide. This is to more easily fit accession labels without making
     * the plot too wide.
     */
    aspect_ratio = 1 / 2;

    gui_margins: GUIMargins = {
        top: this.GUI_SCALE_BAR_SIZE,
        right: 0,
        bottom: 0,
        left: 0
    };

    /**
     * Plot load status (when true, spinner overlay is displayed, unless an
     * error message is displayed).
     */
    plot_loading = true;

    /**
     * Error message string. When not an empty string, error message overlay is
     * displayed.
     */
    error_message = '';

    /**
     * Horizontal / vertical scroll position of the plot.
     */
    plot_position_source = new BehaviorSubject<PlotPosition>({ x: 0, y: 0 });
    get plot_position() {
        return this.plot_position_source.getValue();
    }

    plot_array_source = new BehaviorSubject<Uint8ClampedArray>(null);
    get plot_array() {
        return this.plot_array_source.getValue();
    }

    /**
     * Highlighted area of the plot.
     */
    highlight_source = new BehaviorSubject<SequenceInterval>(undefined);
    set highlight(highlight_interval: SequenceInterval) {
        this.highlight_source.next(highlight_interval);
    }
    get highlight(): SequenceInterval {
        return this.highlight_source.getValue();
    }

    /**
     * List of sequence gaps in the current chromosome.
     */
    private sequenceGaps: SequenceInterval[];

    /**
     * Phylogenetic tree built for the selected accessions (specified in query).
     */
    phyloTree: {
        query: TreeQuery
        tree: TreeNode
    } = { query: null, tree: null };

    private plot_data$: Observable<any[]>;

    /**
     * Genetic distance bins between reference and other accessions for
     * currently viewed interval, fetched from tersect.
     */
    private distanceBins = {};

    get row_num(): number {
        return this.plotState.sorted_accessions.length;
    }

    get col_num(): number {
        return this.distanceBins[this.plotState.sorted_accessions[0]].length;
    }

    get zoom_factor(): number {
        return this.plotState.zoom_level / 100;
    }

    /**
     * Width of accession label / tree area in pixels.
     */
    get labels_width() {
        return this.gui_margins.left * this.zoom_factor;
    }

    get bin_width() {
        return this.zoom_factor;
    }

    get bin_height() {
        return this.zoom_factor / this.aspect_ratio;
    }

    /**
     * Get accession label from dictionary if available. Otherwise the input
     * identifier is used.
     */
    getAccesionLabel(accession: string) {
        if (isNullOrUndefined(this.plotState.accession_dictionary)) {
            return accession;
        } else if (accession in this.plotState.accession_dictionary) {
            return this.plotState.accession_dictionary[accession];
        } else {
            return accession;
        }
    }

    constructor(private plotState: PlotStateService,
                private tersectBackendService: TersectBackendService) {
        const ref_distance_bins$ = combineLatest(this.plotState.dataset_id$,
                                                 this.plotState.reference$,
                                                 this.plotState.chromosome$,
                                                 this.plotState.interval$,
                                                 this.plotState.binsize$).pipe(
            filter(([ds, ref, chrom, interval, binsize]) =>
                ![ds, ref, chrom, interval, binsize].some(isNullOrUndefined)
            ),
            filter(this.validateInputs),
            tap(this.startLoading),
            debounceTime(this.DEBOUNCE_TIME),
            switchMap(([ds, ref, chrom, interval, binsize]) =>
                this.tersectBackendService
                    .getRefDistanceBins(ds, ref, chrom.name,
                                        interval[0], interval[1], binsize)
            ),
        );

        const updated_accessions$ = this.plotState.accessions$.pipe(
            filter((accessions) => !isNullOrUndefined(accessions)),
            filter(this.validateInputs),
            tap(this.startLoading),
            debounceTime(this.DEBOUNCE_TIME),
        );

        const phylo_tree$ = combineLatest(this.plotState.dataset_id$,
                                          this.plotState.chromosome$,
                                          this.plotState.interval$,
                                          updated_accessions$,
                                          this.plotState.binsize$).pipe(
            filter(([ds, chrom, interval, accessions, binsize]) => {
                    return ![ds, chrom, interval,
                             accessions, binsize].some(isNullOrUndefined);
                }
            ),
            filter(this.validateInputs),
            filter(this.treeUpdateRequired),
            tap(this.startLoading),
            debounceTime(this.DEBOUNCE_TIME),
            switchMap(([ds, chrom, interval, accessions]) =>
                this.tersectBackendService
                    .getPhylogeneticTree(ds, chrom.name,
                                         interval[0], interval[1],
                                         accessions)
            )
        );

        const gaps$ = combineLatest(this.plotState.dataset_id$,
                                    this.plotState.chromosome$).pipe(
            filter(([ds, chrom]) => ![ds, chrom].some(isNullOrUndefined)),
            tap(this.startLoading),
            debounceTime(this.DEBOUNCE_TIME),
            switchMap(([ds, chrom]) => this.tersectBackendService
                                           .getGapIndex(ds, chrom.name)),
        );

        this.plot_data$ = combineLatest(ref_distance_bins$,
                                        phylo_tree$,
                                        updated_accessions$,
                                        gaps$).pipe(
            filter((inputs) =>
                !inputs.some(isNullOrUndefined)
            ),
            tap(this.startLoading),
            filter(([ref_dist, [tree_query, tree], , ]) =>
                ref_dist['region'] === formatRegion(tree_query.chromosome_name,
                                                    tree_query.interval[0],
                                                    tree_query.interval[1])
                && ref_dist['region'].split(':')[0] === this.plotState
                                                            .chromosome.name
                && ref_dist['reference'] === this.plotState.reference
            )
        );

        this.plotState.settings$.subscribe(() => {
            // Subscribe to plot data updates once settings are loaded
            this.plot_data$.subscribe(this.generate_plot);
        });
    }

    private generate_plot = ([ref_dist, [tree_query, tree],
                              accessions, gaps]) => {
        this.distanceBins = ref_dist['bins'];
        if (!sameElements(accessions, this.plotState.sorted_accessions)
             || !deepEqual(this.phyloTree.query, tree_query)) {
            this.phyloTree = { query: tree_query, tree: tree };
            this.plotState
                .sorted_accessions = treeToSortedList(this.phyloTree.tree);
            this.sequenceGaps = gaps;
            this.generatePlotArray();
            this.resetPosition();
        } else {
            // Don't reset position if distance matrix did not change
            this.generatePlotArray();
        }
        this.stopLoading();
    }

    private startLoading = () => this.plot_loading = true;
    private stopLoading = () => this.plot_loading = false;

    private validateInputs = () => {
        if (!isNullOrUndefined(this.plotState.accessions)
            && this.plotState.accessions.length < 2) {
            this.error_message = 'At least two accessions must be selected';
            return false;
        }
        const interval = this.plotState.interval;
        if (isNullOrUndefined(interval)
            || isNaN(parseInt(interval[0].toString(), 10))
            || isNaN(parseInt(interval[1].toString(), 10))
            || interval[1] - interval[0] < this.plotState.binsize) {
            this.error_message = 'Invalid interval';
            return false;
        }
        this.error_message = '';
        return true;
    }

    /**
     * Check if a new phylogenetic tree needs to be retrieved due to either no
     * tree being stored or the query changing.
     */
    private treeUpdateRequired = () => {
        if (isNullOrUndefined(this.phyloTree.tree)
            || isNullOrUndefined(this.phyloTree.query)) {
            return true;
        }
        const current_query: TreeQuery = {
            chromosome_name: this.plotState.chromosome.name,
            interval: this.plotState.interval,
            accessions: this.plotState.accessions
        };
        return !deepEqual(this.phyloTree.query, current_query);
    }

    /**
     * Get an array of maximum distances per bin for a given set of accessions.
     */
    private getMaxDistances(accessionBins: number[][]): number[] {
        const bin_max_distances = new Array(accessionBins[0].length).fill(0);
        accessionBins.forEach(acc_bin => {
            acc_bin.forEach((dist, i) => {
                if (dist > bin_max_distances[i]) {
                    bin_max_distances[i] = dist;
                }
            });
        });
        return bin_max_distances;
    }

    private generatePlotArray() {
        const palette = new GreyscalePalette();
        const accessionBins = this.plotState.sorted_accessions.map(
            accession => this.distanceBins[accession]
        );

        const bin_max_distances = this.getMaxDistances(accessionBins);

        const row_num = this.row_num;
        const col_num = this.col_num;
        const plot_array = new Uint8ClampedArray(4 * row_num * col_num);

        accessionBins.forEach((accession_bin, accession_index) => {
            palette.distanceToColors(accession_bin, bin_max_distances)
                   .forEach((color, bin_index) => {
                const pos = 4 * (bin_index + col_num * accession_index);
                plot_array[pos] = color.data[0];
                plot_array[pos + 1] = color.data[1];
                plot_array[pos + 2] = color.data[2];
                plot_array[pos + 3] = color.data[3];
            });
        });

        this.addPlotGaps(plot_array);
        this.plot_array_source.next(plot_array);
    }

    /**
     * Add gaps to existing plot array.
     */
    private addPlotGaps(plot_array: Uint8ClampedArray) {
        this.sequenceGaps.forEach(gap => {
            if (gap.size >= this.plotState.binsize) {
                this.addPlotGap(plot_array, gap);
            }
        });
    }

    private addPlotGap(plot_array: Uint8ClampedArray, gap: SequenceInterval) {
        const row_num = this.row_num;
        const col_num = this.col_num;
        const interval = this.plotState.interval;
        const start_pos = gap.start > interval[0] ? gap.start : interval[0];
        const end_pos = gap.end < interval[1] ? gap.end : interval[1];
        const bin_start = ceilTo(start_pos - interval[0],
                                 this.plotState.binsize)
                          / this.plotState.binsize;
        // NOTE: bin_end index is exclusive while gap.end position is inclusive
        const bin_end = floorTo(end_pos - interval[0] + 1,
                                this.plotState.binsize)
                        / this.plotState.binsize;
        for (let accession_index = 0;
                 accession_index < row_num;
                 accession_index++) {
            for (let bin_index = bin_start; bin_index < bin_end; bin_index++) {
                const pos = 4 * (bin_index + col_num * accession_index);
                plot_array[pos] = this.GAP_COLOR[0];
                plot_array[pos + 1] = this.GAP_COLOR[1];
                plot_array[pos + 2] = this.GAP_COLOR[2];
                plot_array[pos + 3] = this.GAP_COLOR[3];
            }
        }
    }

    updatePosition(pos: PlotPosition) {
        this.plot_position_source.next(pos);
    }

    resetPosition() {
        this.plot_position_source.next({ x: 0, y: 0 });
    }

}

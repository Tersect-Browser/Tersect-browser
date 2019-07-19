import { Injectable } from '@angular/core';
import { PlotPosition } from '../models/PlotPosition';
import { TreeNode, treeToSortedList } from '../clustering/clustering';
import { BehaviorSubject } from 'rxjs/BehaviorSubject';
import { TersectBackendService } from './tersect-backend.service';
import { combineLatest } from 'rxjs/observable/combineLatest';
import { filter, tap, debounceTime, switchMap } from 'rxjs/operators';
import { isNullOrUndefined } from 'util';
import { sameElements, ceilTo, floorTo, formatRegion } from '../utils/utils';
import { GreyscalePalette } from '../introgression-plot/DistancePalette';
import { Chromosome } from '../models/Chromosome';
import { SequenceInterval } from '../models/SequenceInterval';
import { TreeQuery } from '../models/TreeQuery';

import * as deepEqual from 'fast-deep-equal';
import { AccessionDictionary } from '../introgression-browser/browser-settings';

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
     * Zoom level in percentages.
     */
    zoom_level = 100;

    /**
     * Draw phylogenetic tree (if true) or simple list of accessions (if false).
     */
    accession_display: AccessionDisplayStyle = 'labels';

    /**
     * Identifier of the dataset open in the introgression plot.
     */
    private dataset_id_source = new BehaviorSubject<string>(undefined);
    set dataset_id(dataset_id) {
        this.dataset_id_source.next(dataset_id);
    }
    get dataset_id(): string {
        return this.dataset_id_source.getValue();
    }

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
     * Chromosome displayed by the plot.
     */
    private chromosome_source = new BehaviorSubject<Chromosome>(undefined);
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
    set interval(interval: number[]) {
        this.interval_source.next(interval);
    }
    get interval(): number[] {
        return this.interval_source.getValue();
    }

    /**
     * Reference accession used by the plot.
     */
    private reference_source = new BehaviorSubject<string>(undefined);
    set reference(reference: string) {
        this.reference_source.next(reference);
    }
    get reference(): string {
        return this.reference_source.getValue();
    }

    /**
     * Bin size used by the plot.
     */
    private binsize_source = new BehaviorSubject<number>(undefined);
    set binsize(binsize: number) {
        this.binsize_source.next(binsize);
    }
    get binsize(): number {
        return this.binsize_source.getValue();
    }

    /**
     * Accessions displayed in the plot.
     */
    private accessions_source = new BehaviorSubject<string[]>(undefined);
    set accessions(accessions: string[]) {
        if (!sameElements(accessions, this.sorted_accessions)) {
            this.accessions_source.next(accessions);
        }
    }

    /**
     * Dictionary of names to be used for accessions.
     */
    private accession_dictionary_source = new BehaviorSubject<AccessionDictionary>(undefined);
    set accession_dictionary(accession_dictionary: AccessionDictionary) {
        this.accession_dictionary_source.next(accession_dictionary);
    }
    get accession_dictionary(): AccessionDictionary {
        return this.accession_dictionary_source.getValue();
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
     * Accession names (as used by tersect) sorted in the order to
     * be displayed on the drawn plot. Generally this is the order based on
     * the neighbor joining tree clustering.
     */
    sorted_accessions_source = new BehaviorSubject<string[]>(null);
    set sorted_accessions(accessions: string[]) {
        this.sorted_accessions_source.next(accessions);
    }
    get sorted_accessions(): string[] {
        return this.sorted_accessions_source.getValue();
    }

    /**
     * Phylogenetic tree built for the selected accessions (specified in query).
     */
    phyloTree: {
        query: TreeQuery
        tree: TreeNode
    } = { query: null, tree: null };

    /**
     * Genetic distance bins between reference and other accessions for
     * currently viewed interval, fetched from tersect.
     */
    private distanceBins = {};

    get row_num(): number {
        return this.sorted_accessions.length;
    }

    get col_num(): number {
        return this.distanceBins[this.sorted_accessions[0]].length;
    }

    get zoom_factor(): number {
        return this.zoom_level / 100;
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
        if (isNullOrUndefined(this.accession_dictionary)) {
            return accession;
        } else if (accession in this.accession_dictionary) {
            return this.accession_dictionary[accession];
        } else {
            return accession;
        }
    }

    constructor(private tersectBackendService: TersectBackendService) {
        const ref_distance_bins$ = combineLatest(this.dataset_id_source,
                                                 this.reference_source,
                                                 this.chromosome_source,
                                                 this.interval_source,
                                                 this.binsize_source).pipe(
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
            )
        );

        const accessions$ = this.accessions_source.pipe(
            filter((accessions) => !isNullOrUndefined(accessions)),
            filter(this.validateInputs),
            tap(this.startLoading),
            debounceTime(this.DEBOUNCE_TIME)
        );

        const phylo_tree$ = combineLatest(this.dataset_id_source,
                                          this.chromosome_source,
                                          this.interval_source,
                                          accessions$,
                                          this.binsize_source).pipe(
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

        const gaps$ = combineLatest(this.dataset_id_source,
                                    this.chromosome_source).pipe(
            filter(([ds, chrom]) => ![ds, chrom].some(isNullOrUndefined)),
            tap(this.startLoading),
            debounceTime(this.DEBOUNCE_TIME),
            switchMap(([ds, chrom]) => this.tersectBackendService
                                           .getGapIndex(ds, chrom.name))
        );

        combineLatest(ref_distance_bins$,
                      phylo_tree$,
                      accessions$,
                      gaps$).pipe(
            filter((inputs) =>
                !inputs.some(isNullOrUndefined)
            ),
            tap(this.startLoading),
            filter(([ref_dist, [tree_query, tree], , ]) =>
                ref_dist['region'] === formatRegion(tree_query.chromosome_name,
                                                    tree_query.interval[0],
                                                    tree_query.interval[1])
                && ref_dist['region'].split(':')[0] === this.chromosome.name
                && ref_dist['reference'] === this.reference_source.getValue()
            )
        ).subscribe(([ref_dist, [tree_query, tree], accessions, gaps]) => {
            this.distanceBins = ref_dist['bins'];
            if (!sameElements(accessions, this.sorted_accessions)
                 || !deepEqual(this.phyloTree.query, tree_query)) {
                this.phyloTree = { query: tree_query, tree: tree };
                this.sorted_accessions = treeToSortedList(this.phyloTree.tree);
                this.sequenceGaps = gaps;
                this.generatePlotArray();
                this.resetPosition();
            } else {
                // Don't reset position if distance matrix did not change
                this.generatePlotArray();
            }
            this.stopLoading();
        });
    }

    private startLoading = () => this.plot_loading = true;
    private stopLoading = () => this.plot_loading = false;

    private validateInputs = () => {
        const accessions = this.accessions_source.getValue();
        if (!isNullOrUndefined(accessions) && accessions.length < 2) {
            this.error_message = 'At least two accessions must be selected';
            return false;
        }
        const interval = this.interval_source.getValue();
        if (isNaN(parseInt(interval[0].toString(), 10))
            || isNaN(parseInt(interval[1].toString(), 10))
            || interval[1] - interval[0] < this.binsize) {
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
        if (isNullOrUndefined(this.phyloTree.tree) || this.phyloTree.query) {
            return true;
        }
        const current_query: TreeQuery = {
            chromosome_name: this.chromosome.name,
            interval: this.interval,
            accessions: this.accessions
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
        const accessionBins = this.sorted_accessions.map(
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
            if (gap.size >= this.binsize) {
                this.addPlotGap(plot_array, gap);
            }
        });
    }

    private addPlotGap(plot_array: Uint8ClampedArray, gap: SequenceInterval) {
        const row_num = this.row_num;
        const col_num = this.col_num;
        const start_pos = gap.start > this.interval[0] ? gap.start
                                                       : this.interval[0];
        const end_pos = gap.end < this.interval[1] ? gap.end
                                                   : this.interval[1];
        const bin_start = ceilTo(start_pos - this.interval[0], this.binsize)
                          / this.binsize;
        // NOTE: bin_end index is exclusive while gap.end position is inclusive
        const bin_end = floorTo(end_pos - this.interval[0] + 1, this.binsize)
                        / this.binsize;
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

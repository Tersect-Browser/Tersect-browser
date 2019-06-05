import { Component, OnInit, ViewChild, ElementRef, HostListener, Input, AfterViewInit } from '@angular/core';
import { GreyscalePalette, RedPalette } from './DistancePalette';
import { TersectBackendService } from '../services/tersect-backend.service';
import { Chromosome } from '../models/chromosome';
import { BehaviorSubject } from 'rxjs/BehaviorSubject';
import { DistanceMatrix } from '../models/DistanceMatrix';
import { buildNJTree, treeToSortedList } from '../clustering/clustering';
import { combineLatest } from 'rxjs/observable/combineLatest';
import { switchMap } from 'rxjs/operators/switchMap';
import { debounceTime, filter, tap } from 'rxjs/operators';
import { isNullOrUndefined } from 'util';
import { sameElements, ceilTo, floorTo } from '../utils/utils';
import { SequenceGap } from '../models/GapIndex';
import { ScaleBarComponent } from './scale-bar/scale-bar.component';
import { IntrogressionPlotService } from '../services/introgression-plot.service';
import { AccessionBarComponent } from './accession-bar/accession-bar.component';
import { PlotPosition } from '../models/PlotPosition';

@Component({
    selector: 'app-introgression-plot',
    templateUrl: './introgression-plot.component.html',
    styleUrls: ['./introgression-plot.component.css'],
    providers: [ IntrogressionPlotService ]
})

export class IntrogressionPlotComponent implements OnInit, AfterViewInit {
    @ViewChild('plotCanvas') plotCanvas: ElementRef;

    @ViewChild(ScaleBarComponent) scaleBar: ScaleBarComponent;
    @ViewChild(AccessionBarComponent) accessionBar: AccessionBarComponent;

    // R, G, B, A color
    readonly GAP_COLOR = [240, 180, 180, 255];

    readonly DEFAULT_BIN_SIZE = 50000;
    readonly DEBOUNCE_TIME = 700;

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
     * Clamped array used to represent the distance plot.
     */
    private plot_array: Uint8ClampedArray = null;

    @Input()
    set chromosome(chromosome: Chromosome) {
        this.chromosome_source.next(chromosome);
    }
    private chromosome_source = new BehaviorSubject<Chromosome>(undefined);

    get chromosome() {
        return this.chromosome_source.getValue();
    }

    @Input()
    set interval(interval: number[]) {
        this.plotService.interval = interval;
        this.interval_source.next(interval);
    }
    private interval_source = new BehaviorSubject<number[]>(undefined);

    get interval(): number[] {
        return this.interval_source.getValue();
    }

    @Input()
    set reference(reference_accession: string) {
        this.reference_source.next(reference_accession);
    }
    private reference_source = new BehaviorSubject<string>(undefined);

    @Input()
    set binsize(binsize: number) {
        this.plotService.binsize = binsize;
        this.binsize_source.next(binsize);
    }
    private binsize_source = new BehaviorSubject<number>(this.DEFAULT_BIN_SIZE);

    get binsize(): number {
        return this.binsize_source.getValue();
    }

    @Input()
    set accessions(accessions: string[]) {
        if (!sameElements(accessions, this.plotService.sortedAccessions)) {
            this.accessions_source.next(accessions);
        }
    }
    private accessions_source = new BehaviorSubject<string[]>(undefined);

    @Input()
    set drawTree(draw_tree: boolean) {
        if (draw_tree !== this.plotService.draw_tree) {
            this.plotService.draw_tree = draw_tree;
            this.drawPlot();
        }
    }

    /**
     * Zoom level in percentages.
     */
    @Input()
    set zoom_level(zoom_level: number) {
        if (zoom_level !== this.plotService.zoom_level) {
            this.plotService.zoom_level = zoom_level;
            this.updatePlotZoom();
            this.drawPlot();
        }
    }

    /**
     * List of sequence gaps in the current chromosome.
     */
    private sequenceGaps: SequenceGap[];

    /**
     * Pairwise distance matrix between all the accessions.
     */
    private distanceMatrix: DistanceMatrix;

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

    private updatePlotZoom() {
        this.plotCanvas.nativeElement
                       .style.width = `${this.plotService.zoom_level}%`;
        this.plotCanvas.nativeElement
                       .style.height = `${this.plotService.zoom_level
                                          / this.plotService.aspect_ratio}%`;
    }

    private updateCanvasSize() {
        const canvas_width = this.plotCanvas.nativeElement.parentElement
                                                          .parentElement
                                                          .offsetWidth;
        const canvas_height = this.plotCanvas.nativeElement.parentElement
                                                           .parentElement
                                                           .offsetHeight;
        this.plotCanvas.nativeElement.width = canvas_width;
        this.plotCanvas.nativeElement.height = canvas_height;
        this.accessionBar.height = canvas_height;
    }

    private drawGUI() {
        this.accessionBar.draw();
        this.scaleBar.draw();
    }

    private generatePlotArray() {
        const ctx: CanvasRenderingContext2D = this.plotCanvas
                                                  .nativeElement
                                                  .getContext('2d');
        const palette = new GreyscalePalette(ctx);
        const accessionBins = this.plotService.sortedAccessions.map(
            accession => this.plotService.distanceBins[accession]
        );

        const bin_max_distances = this.getMaxDistances(accessionBins);

        const row_num = this.plotService.row_num;
        const col_num = this.plotService.col_num;
        this.plot_array = new Uint8ClampedArray(4 * row_num * col_num);

        accessionBins.forEach((accession_bin, accession_index) => {
            palette.distanceToColors(accession_bin, bin_max_distances)
                   .forEach((color, bin_index) => {
                const pos = 4 * (bin_index + col_num * accession_index);
                this.plot_array[pos] = color.data[0];
                this.plot_array[pos + 1] = color.data[1];
                this.plot_array[pos + 2] = color.data[2];
                this.plot_array[pos + 3] = color.data[3];
            });
        });
        this.drawGaps();
    }

    /**
     * Add gaps to existing plot array.
     */
    private drawGaps() {
        this.sequenceGaps.forEach(gap => {
            if (gap.size >= this.binsize) {
                this.drawGap(gap);
            }
        });
    }

    private drawGap(gap: SequenceGap) {
        const row_num = this.plotService.row_num;
        const col_num = this.plotService.col_num;
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
                this.plot_array[pos] = this.GAP_COLOR[0];
                this.plot_array[pos + 1] = this.GAP_COLOR[1];
                this.plot_array[pos + 2] = this.GAP_COLOR[2];
                this.plot_array[pos + 3] = this.GAP_COLOR[3];
            }
        }
    }

    private drawBins() {
        const ctx: CanvasRenderingContext2D = this.plotCanvas
                                                  .nativeElement
                                                  .getContext('2d');
        ctx.clearRect(0, 0, this.plotCanvas.nativeElement.width,
                      this.plotCanvas.nativeElement.height);
        ctx.putImageData(new ImageData(this.plot_array,
                                       this.plotService.col_num,
                                       this.plotService.row_num),
                         this.plotService.plot_position.x + this.plotService
                                                                .gui_margins
                                                                .left,
                         this.plotService.plot_position.y);
    }

    private drawPlot() {
        this.drawGUI();
        this.drawBins();
        this.stopLoading();
    }

    private validateInputs = () => {
        const accessions = this.accessions_source.getValue();
        if (!isNullOrUndefined(accessions) && accessions.length < 2) {
            this.error_message = 'At least two accessions must be selected';
            return false;
        }
        const interval = this.interval_source.getValue();
        if (isNaN(parseInt(interval[0].toString(), 10))
            || isNaN(parseInt(interval[1].toString(), 10))
            || interval[1] - interval[0] < this.binsize_source.getValue()) {
            this.error_message = 'Invalid interval';
            return false;
        }
        this.error_message = '';
        return true;
    }

    private startLoading = () => this.plot_loading = true;
    private stopLoading = () => this.plot_loading = false;

    constructor(private tersectBackendService: TersectBackendService,
                private plotService: IntrogressionPlotService) { }

    ngOnInit() {
        this.plotService.plot_position_source.subscribe((pos: PlotPosition) => {
            // console.log(pos);
            // this.drawPlot();
        });

        const ref_distance_bins$ = combineLatest(this.reference_source,
                                                 this.chromosome_source,
                                                 this.interval_source,
                                                 this.binsize_source).pipe(
            filter(([ref, chrom, interval, binsize]) =>
                !isNullOrUndefined(ref)
                && !isNullOrUndefined(chrom)
                && !isNullOrUndefined(interval)
                && !isNullOrUndefined(binsize)),
            filter(this.validateInputs),
            tap(this.startLoading),
            debounceTime(this.DEBOUNCE_TIME),
            switchMap(([ref, chrom, interval, binsize]) =>
                this.tersectBackendService
                    .getRefDistanceBins(ref, chrom.name,
                                        interval[0], interval[1], binsize)
            )
        );

        const distance_matrix$ = combineLatest(this.chromosome_source,
                                               this.interval_source).pipe(
            filter(([chrom, interval]) =>
                !isNullOrUndefined(chrom)
                && !isNullOrUndefined(interval)),
            filter(this.validateInputs),
            tap(this.startLoading),
            debounceTime(this.DEBOUNCE_TIME),
            switchMap(([chrom, interval]) =>
                this.tersectBackendService
                    .getDistanceMatrix(chrom.name, interval[0], interval[1])
            )
        );

        const accessions$ = this.accessions_source.pipe(
            filter((accessions) => !isNullOrUndefined(accessions)),
            filter(this.validateInputs),
            tap(this.startLoading),
            debounceTime(this.DEBOUNCE_TIME)
        );

        const gaps$ = this.chromosome_source.pipe(
            filter((chrom) => !isNullOrUndefined(chrom)),
            tap(this.startLoading),
            debounceTime(this.DEBOUNCE_TIME),
            switchMap((chrom) => this.tersectBackendService
                                     .getGapIndex(chrom.name))
        );

        combineLatest(ref_distance_bins$,
                      distance_matrix$,
                      accessions$,
                      gaps$).pipe(
            filter(([ref_dist, dist_mat, accessions, gaps]) =>
                !isNullOrUndefined(ref_dist)
                && !isNullOrUndefined(dist_mat)
                && !isNullOrUndefined(accessions)
                && !isNullOrUndefined(gaps)),
            tap(this.startLoading),
            filter(([ref_dist, dist_mat, , ]) =>
                   ref_dist['region'] === dist_mat['region']
                   && ref_dist['region'].split(':')[0] === this.chromosome.name
                   && ref_dist['reference'] === this.reference_source.getValue()
            )
        ).subscribe(([ref_dist, dist_mat, accessions, gaps]) => {
            this.plotService.distanceBins = ref_dist['bins'];
            if (!sameElements(accessions, this.plotService.sortedAccessions)
                || this.distanceMatrix !== dist_mat) {
                this.distanceMatrix = dist_mat;
                this.plotService.njTree = buildNJTree(this.distanceMatrix,
                                                      accessions);
                this.plotService
                    .sortedAccessions = treeToSortedList(this.plotService
                                                             .njTree);
                this.sequenceGaps = gaps;
            }
            this.generatePlotArray();
            this.drawPlot();
        });
    }

    ngAfterViewInit() {
        this.updateCanvasSize();
        this.updatePlotZoom();
    }

    @HostListener('window:orientationchange', ['$event'])
    @HostListener('window:resize', ['$event'])
    onResize(event) {
        this.updateCanvasSize();
        this.drawPlot();
    }

}

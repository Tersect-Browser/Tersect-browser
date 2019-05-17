import { Component, OnInit, ViewChild, ElementRef, HostListener, Input } from '@angular/core';
import { GreyscalePalette, RedPalette } from './DistancePalette';
import { TersectBackendService } from '../services/tersect-backend.service';
import { Chromosome } from '../models/chromosome';
import { PlotPosition, PlotBin, PlotAccession, PlotArea, PlotBackground } from '../models/PlotPosition';
import { BehaviorSubject } from 'rxjs/BehaviorSubject';
import { DistanceMatrix } from '../models/DistanceMatrix';
import { njTreeSortAccessions } from '../clustering/clustering';
import { Observable } from 'rxjs/Observable';
import { combineLatest } from 'rxjs/observable/combineLatest';
import { switchMap } from 'rxjs/operators/switchMap';
import { debounceTime, filter, tap } from 'rxjs/operators';
import { isNullOrUndefined } from 'util';
import { sameElements } from '../utils/utils';

@Component({
    selector: 'app-introgression-plot',
    templateUrl: './introgression-plot.component.html',
    styleUrls: ['./introgression-plot.component.css']
})

export class IntrogressionPlotComponent implements OnInit {
    @ViewChild('plotCanvas') plotCanvas: ElementRef;
    @ViewChild('guiCanvas') guiCanvas: ElementRef;

    readonly GUI_BG_COLOR = '#FFFFFF';
    readonly GUI_TEXT_COLOR = '#000000';

    readonly DEFAULT_BIN_SIZE = 50000;
    readonly DEBOUNCE_TIME = 700;

    /**
     * True if plot is currently being dragged.
     */
    private dragging_plot = false;

    /**
     *  Used to keep track of the previous position during dragging.
     */
    private previous_drag_position = { x: 0, y: 0 };

    /**
     * Displacement of initial plot position based on GUI size.
     */
    private gui_margins = { top: 0, right: 0, bottom: 0, left: 0 };

    /**
     * Used to keep remember the position of a mouse press.
     * This is necessary to distinguish clicks (where the position doesn't
     * change between the press and release) from drags (where it does).
     */
    private mouse_down_position: PlotPosition = { x: 0, y: 0 };

    /**
     * Current position / offset of the introgression plot.
     */
    private plot_position: PlotPosition = { x: 0, y: 0 };

    /**
     * Width of the accession labels.
     */
    private label_width = 0;

    /**
     * Clamped array used to represent the distance plot.
     */
    private plot_array: Uint8ClampedArray = null;

    @Input()
    set chromosome(chromosome: Chromosome) {
        this.chromosome_source.next(chromosome);
    }
    chromosome_source = new BehaviorSubject<Chromosome>(undefined);

    @Input()
    set interval(interval: number[]) {
        this.interval_source.next(interval);
    }
    interval_source = new BehaviorSubject<number[]>(undefined);

    @Input()
    set reference(reference_accession: string) {
        this.reference_source.next(reference_accession);
    }
    reference_source = new BehaviorSubject<string>(undefined);

    @Input()
    set binsize(binsize: number) {
        this.binsize_source.next(binsize);
    }
    binsize_source = new BehaviorSubject<number>(this.DEFAULT_BIN_SIZE);
    binsize$: Observable<number>;

    @Input()
    set accessions(accessions: string[]) {
        if (!sameElements(accessions, this.sortedAccessions)) {
            this.accessions_source.next(accessions);
        }
    }
    accessions_source = new BehaviorSubject<string[]>(undefined);

    /**
     * Bin aspect ratio (width / height). By default bins are twice as high as
     * they are wide. This is to more easily fit accession labels without making
     * the plot too wide.
     */
    private aspect_ratio = 1 / 2;

    /**
     * Zoom level in percentages.
     */
    private _zoom_level = 100;
    @Input()
    set zoom_level(zoom_level: number) {
        if (this._zoom_level !== zoom_level) {
            this._zoom_level = zoom_level;
            this.updatePlotZoom();
            // No need to redraw bins when zooming
            this.drawGUI();
        }
    }
    get zoom_level(): number {
        return this._zoom_level;
    }

    plot_loading = true;

    /**
     * Genetic distance bins between reference and other accessions for
     * currently viewed interval, fetched from tersect.
     */
    private distanceBins = {};

    /**
     * Accession names (as used by tersect) sorted in the order to
     * be displayed on the drawn plot. Generally this is the order based on
     * the neighbor joining tree clustering.
     */
    private sortedAccessions: string[] = [];

    /**
     * Pairwise distance matrix between all the accessions.
     */
    private distanceMatrix: DistanceMatrix;

    error_message = '';

    constructor(private tersectBackendService: TersectBackendService) { }

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
        this.plotCanvas.nativeElement.style.width = `${this._zoom_level}%`;
        this.plotCanvas.nativeElement.style.height = `${this._zoom_level
                                                     / this.aspect_ratio}%`;
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
        this.guiCanvas.nativeElement.width = canvas_width;
        this.guiCanvas.nativeElement.height = canvas_height;
    }

    private drawGUI() {
        const ctx: CanvasRenderingContext2D = this.guiCanvas
                                                  .nativeElement
                                                  .getContext('2d');
        ctx.clearRect(0, 0, this.guiCanvas.nativeElement.width,
                      this.guiCanvas.nativeElement.height);
        this.drawAccessionLabels(this.guiCanvas);
        this.gui_margins.left = this.label_width / (this._zoom_level / 100);
    }

    private drawAccessionLabels(canvas: ElementRef) {
        const ctx: CanvasRenderingContext2D = canvas.nativeElement
                                                    .getContext('2d');
        const text_height = ((this._zoom_level / this.aspect_ratio) / 100);
        ctx.font = `${text_height}px Arial`;

        let yoffset = this.plot_position.y * (this._zoom_level / 100)
                      / this.aspect_ratio;
        yoffset = Math.floor(yoffset / text_height) * text_height;

        this.label_width = Math.max(
            ...this.sortedAccessions.map(label => ctx.measureText(label).width)
        );
        // Draw background
        ctx.fillStyle = this.GUI_BG_COLOR;
        ctx.fillRect(0, 0, this.label_width, canvas.nativeElement.height);
        // Draw labels
        this.sortedAccessions.forEach((label, index) => {
            ctx.fillStyle = this.GUI_TEXT_COLOR;
            ctx.fillText(label, 0, yoffset + (1 + index) * text_height - 2);
        });
    }

    generatePlotArray() {
        const ctx: CanvasRenderingContext2D = this.plotCanvas
                                                  .nativeElement
                                                  .getContext('2d');
        const palette = new GreyscalePalette(ctx);
        const accessionBins = this.sortedAccessions
                                  .map(accession => this.distanceBins[accession]);

        const bin_max_distances = this.getMaxDistances(accessionBins);

        const row_num = this.sortedAccessions.length;
        const col_num = accessionBins[0].length;
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
    }

    drawBins() {
        const row_num = this.sortedAccessions.length;
        const col_num = this.distanceBins[this.sortedAccessions[0]].length;
        const ctx: CanvasRenderingContext2D = this.plotCanvas
                                                  .nativeElement
                                                  .getContext('2d');
        ctx.clearRect(0, 0, this.plotCanvas.nativeElement.width,
                      this.plotCanvas.nativeElement.height);
        ctx.putImageData(new ImageData(this.plot_array, col_num, row_num),
                         this.plot_position.x + this.gui_margins.left,
                         this.plot_position.y + this.gui_margins.top);
    }

    drawPlot() {
        this.drawGUI();
        this.drawBins();
        this.stopLoading();
    }

    validateInputs = () => {
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

    ngOnInit() {
        this.updateCanvasSize();
        this.updatePlotZoom();

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

        combineLatest(ref_distance_bins$,
                      distance_matrix$,
                      accessions$).pipe(
            filter(([ref_dist, dist_mat, accessions]) =>
                !isNullOrUndefined(ref_dist)
                && !isNullOrUndefined(dist_mat)
                && !isNullOrUndefined(accessions)),
            tap(this.startLoading),
            filter(([ref_dist, dist_mat, ]) =>
                   ref_dist['region'] === dist_mat['region']
                   && ref_dist['reference'] === this.reference_source.getValue()
            )
        ).subscribe(([ref_dist, dist_mat, accessions]) => {
            this.distanceBins = ref_dist['bins'];
            if (!sameElements(accessions, this.sortedAccessions)
                || this.distanceMatrix !== dist_mat) {
                this.distanceMatrix = dist_mat;
                this.sortedAccessions = njTreeSortAccessions(this.distanceMatrix,
                                                             accessions);
            }
            this.generatePlotArray();
            this.drawPlot();
        });
    }

    startLoading = () => this.plot_loading = true;
    stopLoading = () => this.plot_loading = false;

    guiMouseMove(event) {
        if (this.dragging_plot) {
            this.dragPlot(event);
        } else {
            // console.log(event);
        }
    }

    guiMouseDown(event) {
        this.mouse_down_position = { x: event.layerX, y: event.layerY };
        const target = this.getPositionTarget(this.mouse_down_position);
        if (target.type === 'bin' || target.type === 'background') {
            this.startDrag(event);
        }
    }

    guiMouseUp(event) {
        if (this.mouse_down_position.x === event.layerX
            && this.mouse_down_position.y === event.layerY) {
            console.log(this.getPositionTarget(this.mouse_down_position));
        }
        this.stopDrag(event);
    }

    private getPositionTarget(position: PlotPosition): PlotArea {
        const inner_position = {
            x: position.x / (this._zoom_level / 100) - this.gui_margins.left,
            y: position.y / (this._zoom_level / 100) - this.gui_margins.top
        };
        if (inner_position.x > 0 && inner_position.y > 0) {
            if (inner_position.x < this.plot_position.x) {
                return {
                    type: 'background'
                };
            }
            return this.plotToBinPosition(position);
        } else {
            const res: PlotAccession = {
                type: 'accession',
                accession: 'ACCESSION'
            };
            return res;
        }
    }

    private plotToBinPosition(position: PlotPosition): PlotBin {
        const bin_width = this._zoom_level / 100;
        const text_height = ((this._zoom_level / this.aspect_ratio) / 100);

        let yoffset = this.plot_position.y * (this._zoom_level / 100)
                      / this.aspect_ratio;
        yoffset = Math.floor(yoffset / text_height) * text_height;

        const label_index = Math.floor((position.y - 2 - yoffset)
                                       / text_height);
        if (label_index >= this.sortedAccessions.length) {
            return null;
        }

        const interval = this.interval_source.getValue();
        const binsize = this.binsize_source.getValue();
        const bin_index = Math.floor((position.x - this.label_width) / bin_width
                                     - this.plot_position.x - 0.5);
        // console.log(bin_index);
        const start_pos = interval[0] + bin_index * binsize;
        if (start_pos < 1 || start_pos > interval[1]) {
            return null;
        }
        let end_pos = interval[0] + (bin_index + 1) * binsize;
        if (end_pos > interval[1]) {
            end_pos = interval[1];
        }
        return {
            type: 'bin',
            accession: this.sortedAccessions[label_index],
            start_position: start_pos,
            end_position: end_pos
        };
    }

    private dragPlot(event) {
        if (event.buttons !== 1) {
            this.stopDrag(event);
            return;
        }
        this.plot_position.x += (event.layerX - this.previous_drag_position.x)
                                * 100 / this.zoom_level;
        this.plot_position.y += (event.layerY - this.previous_drag_position.y)
                                * this.aspect_ratio
                                * 100 / this.zoom_level;
        if (this.plot_position.x > 0) {
            this.plot_position.x = 0;
        }
        if (this.plot_position.y > 0) {
            this.plot_position.y = 0;
        }
        this.previous_drag_position = { x: event.layerX, y: event.layerY };
        this.drawPlot();
    }

    startDrag(event) {
        // drag on left mouse button
        if (event.buttons === 1) {
            this.plotCanvas.nativeElement.style.cursor = 'move';
            this.dragging_plot = true;
            this.previous_drag_position = { x: event.layerX, y: event.layerY };
        }
    }

    stopDrag(event) {
        this.plotCanvas.nativeElement.style.cursor = 'auto';
        this.dragging_plot = false;
    }

    @HostListener('window:resize', ['$event'])
    onResize(event) {
        this.updateCanvasSize();
        this.drawPlot();
    }

}

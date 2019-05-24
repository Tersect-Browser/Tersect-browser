import { Component, OnInit, ViewChild, ElementRef, HostListener, Input, AfterViewInit, Output, EventEmitter } from '@angular/core';
import { GreyscalePalette, RedPalette } from './DistancePalette';
import { TersectBackendService } from '../services/tersect-backend.service';
import { Chromosome } from '../models/chromosome';
import { PlotPosition, PlotBin, PlotAccession, PlotArea, PlotClickEvent } from '../models/PlotPosition';
import { BehaviorSubject } from 'rxjs/BehaviorSubject';
import { DistanceMatrix } from '../models/DistanceMatrix';
import { njTreeSortAccessions } from '../clustering/clustering';
import { combineLatest } from 'rxjs/observable/combineLatest';
import { switchMap } from 'rxjs/operators/switchMap';
import { debounceTime, filter, tap } from 'rxjs/operators';
import { isNullOrUndefined } from 'util';
import { sameElements, ceilTo, formatPosition } from '../utils/utils';

@Component({
    selector: 'app-introgression-plot',
    templateUrl: './introgression-plot.component.html',
    styleUrls: ['./introgression-plot.component.css']
})

export class IntrogressionPlotComponent implements OnInit, AfterViewInit {
    @ViewChild('plotCanvas') plotCanvas: ElementRef;
    @ViewChild('guiCanvas') guiCanvas: ElementRef;
    @ViewChild('tooltip') tooltip: ElementRef;

    readonly GUI_BG_COLOR = '#FFFFFF';
    readonly GUI_TEXT_COLOR = '#000000';

    readonly DEFAULT_BIN_SIZE = 50000;
    readonly DEBOUNCE_TIME = 700;

    /**
     * Tooltip position relative to mouse.
     */
    readonly tooltip_offset: PlotPosition = { x: 0, y: 20 };

    /**
     * Delay before a tooltip appears.
     */
    readonly TOOLTIP_DELAY: 200;

    /**
     * Bin aspect ratio (width / height). By default bins are twice as high as
     * they are wide. This is to more easily fit accession labels without making
     * the plot too wide.
     */
    private aspect_ratio = 1 / 2;

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
     * True if plot is currently being dragged.
     */
    private dragging_plot = false;

    /**
     *  Used to keep track of the start position during dragging.
     */
    private drag_start_position = { x: 0, y: 0 };

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
     * Clamped array used to represent the distance plot.
     */
    private plot_array: Uint8ClampedArray = null;

    /**
     * Timer used to delay displaying a tooltip.
     */
    private tooltip_timer;

    @Input()
    set chromosome(chromosome: Chromosome) {
        this.chromosome_source.next(chromosome);
    }
    private chromosome_source = new BehaviorSubject<Chromosome>(undefined);

    @Input()
    set interval(interval: number[]) {
        this.interval_source.next(interval);
    }
    private interval_source = new BehaviorSubject<number[]>(undefined);

    @Input()
    set reference(reference_accession: string) {
        this.reference_source.next(reference_accession);
    }
    private reference_source = new BehaviorSubject<string>(undefined);

    @Input()
    set binsize(binsize: number) {
        this.binsize_source.next(binsize);
    }
    private binsize_source = new BehaviorSubject<number>(this.DEFAULT_BIN_SIZE);

    @Input()
    set accessions(accessions: string[]) {
        if (!sameElements(accessions, this.sortedAccessions)) {
            this.accessions_source.next(accessions);
        }
    }
    private accessions_source = new BehaviorSubject<string[]>(undefined);

    /**
     * Emitted when plot elements (bins, accessions) are clicked.
     */
    @Output() plotClick = new EventEmitter<PlotClickEvent>();

    /**
     * Zoom level in percentages.
     */
    private _zoom_level = 100;
    @Input()
    set zoom_level(zoom_level: number) {
        if (this._zoom_level !== zoom_level) {
            this._zoom_level = zoom_level;
            this.updatePlotZoom();
            this.drawPlot();
        }
    }
    get zoom_level(): number {
        return this._zoom_level;
    }

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
        this.hideTooltip();
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
    }

    private drawAccessionLabels(canvas: ElementRef) {
        const ctx: CanvasRenderingContext2D = canvas.nativeElement
                                                    .getContext('2d');
        const text_height = this.getRowHeight();
        ctx.font = `${text_height}px Arial`;

        const yoffset = ceilTo(this.plot_position.y * (this._zoom_level / 100)
                               / this.aspect_ratio, text_height);

        const max_label_width = Math.max(
            ...this.sortedAccessions.map(label => ctx.measureText(label).width)
        );
        this.gui_margins.left = Math.ceil(max_label_width
                                          / (this._zoom_level / 100));
        const background_width = this.gui_margins.left * this._zoom_level / 100;

        // Draw background
        ctx.fillStyle = this.GUI_BG_COLOR;
        ctx.fillRect(0, 0, background_width, canvas.nativeElement.height);

        // Draw labels
        this.sortedAccessions.forEach((label, index) => {
            ctx.fillStyle = this.GUI_TEXT_COLOR;
            ctx.textBaseline = 'top';
            ctx.fillText(label, 0, yoffset + index * text_height);
        });
    }

    private generatePlotArray() {
        const ctx: CanvasRenderingContext2D = this.plotCanvas
                                                  .nativeElement
                                                  .getContext('2d');
        const palette = new GreyscalePalette(ctx);
        const accessionBins = this.sortedAccessions
                                  .map(accession => this.distanceBins[accession]);

        const bin_max_distances = this.getMaxDistances(accessionBins);

        const row_num = this.getRowNum();
        const col_num = this.getColNum();
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

    private getColWidth() {
        return (this._zoom_level / 100);
    }

    private getRowHeight() {
        return (this._zoom_level / 100) / this.aspect_ratio;
    }

    private getRowNum() {
        return this.sortedAccessions.length;
    }

    private getColNum() {
        return this.distanceBins[this.sortedAccessions[0]].length;
    }

    private drawBins() {
        const ctx: CanvasRenderingContext2D = this.plotCanvas
                                                  .nativeElement
                                                  .getContext('2d');
        ctx.clearRect(0, 0, this.plotCanvas.nativeElement.width,
                      this.plotCanvas.nativeElement.height);
        ctx.putImageData(new ImageData(this.plot_array, this.getColNum(),
                                       this.getRowNum()),
                         this.plot_position.x + this.gui_margins.left,
                         this.plot_position.y + this.gui_margins.top);
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

    private getPositionTarget(mouse_position: PlotPosition): PlotArea {
        const inner_position = {
            x: Math.floor(mouse_position.x / this.getColWidth())
               - this.gui_margins.left
               - this.plot_position.x,
            y: Math.floor(mouse_position.y / this.getRowHeight())
               - this.gui_margins.top
               - this.plot_position.y
        };

        if (inner_position.x >= this.getColNum()
            || inner_position.y >= this.getRowNum()) {
            const res_bg = { type: 'background' };
            return res_bg;
        }

        if (inner_position.x + this.plot_position.x < 0) {
            const res_acc: PlotAccession = {
                type: 'accession',
                accession: this.sortedAccessions[inner_position.y]
            };
            return res_acc;
        }

        const interval = this.interval_source.getValue();
        const binsize = this.binsize_source.getValue();

        const res_bin: PlotBin = {
            type: 'bin',
            accession: this.sortedAccessions[inner_position.y],
            start_position: interval[0] + inner_position.x * binsize,
            end_position: interval[0] + (inner_position.x + 1) * binsize - 1
        };
        return res_bin;
    }

    private dragPlot(event) {
        if (event.buttons !== 1) {
            this.stopDrag(event);
            return;
        }
        if (this.guiCanvas.nativeElement.style.cursor !== 'move') {
            this.guiCanvas.nativeElement.style.cursor = 'move';
        }
        this.plot_position.x = (event.layerX - this.drag_start_position.x)
                               / (this.zoom_level / 100);
        this.plot_position.y = (event.layerY - this.drag_start_position.y)
                               * this.aspect_ratio
                               / (this.zoom_level / 100);
        this.plot_position.x = Math.round(this.plot_position.x);
        this.plot_position.y = Math.round(this.plot_position.y);
        if (this.plot_position.x > 0) {
            this.plot_position.x = 0;
        }
        if (this.plot_position.y > 0) {
            this.plot_position.y = 0;
        }
        this.drawPlot();
    }

    private startDrag(event) {
        // drag on left mouse button
        if (event.buttons === 1) {
            this.dragging_plot = true;
            this.drag_start_position = {
                x: event.layerX - this.plot_position.x
                                  * this.zoom_level / 100,
                y: event.layerY - this.plot_position.y
                                  / this.aspect_ratio
                                  * this.zoom_level / 100
            };
        }
    }

    private stopDrag(event) {
        this.guiCanvas.nativeElement.style.cursor = 'auto';
        this.dragging_plot = false;
    }

    constructor(private tersectBackendService: TersectBackendService) { }

    ngOnInit() {
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
            this.plot_position = { x: 0, y: 0 };
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

    private showTooltip(mouse_position: PlotPosition, content: string) {
        this.tooltip.nativeElement.style.left = `${mouse_position.x
                                                   + this.tooltip_offset.x}px`;
        this.tooltip.nativeElement.style.top = `${mouse_position.y
                                                  + this.tooltip_offset.y}px`;
        this.tooltip.nativeElement.style.visibility = 'visible';
        this.tooltip.nativeElement.innerHTML = content;
    }

    private hideTooltip() {
        clearTimeout(this.tooltip_timer);
        this.tooltip.nativeElement.style.visibility = 'hidden';
    }

    private formatBinTooltip(target: PlotBin): string {
        return `${target.accession}<br>${formatPosition(target.start_position)}
- ${formatPosition(target.end_position)}`;
    }

    private prepareTooltip(event) {
        this.hideTooltip();
        const pos = { x: event.layerX, y: event.layerY };
        const area = this.getPositionTarget(pos);
        if (area.type === 'background') { return; }

        let content = '';
        if (area.type === 'bin') {
            content = this.formatBinTooltip(area as PlotBin);
        } else if (area.type === 'accession') {
            content = `${(area as PlotAccession).accession}`;
        }

        clearTimeout(this.tooltip_timer);
        this.tooltip_timer = setTimeout(() => this.showTooltip(pos, content),
                                        this.TOOLTIP_DELAY);
    }

    guiMouseMove(event) {
        this.prepareTooltip(event);
        if (this.dragging_plot) {
            this.dragPlot(event);
        } else {
            // console.log(event);
        }
    }

    guiMouseLeave(event) {
        this.hideTooltip();
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
            const target = this.getPositionTarget(this.mouse_down_position);
            this.plotClick.emit({
                x: event.layerX,
                y: event.layerY,
                target: target,
            });
        }
        this.stopDrag(event);
    }

}

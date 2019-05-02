import { Component, OnInit, ViewChild, ElementRef, HostListener, Input, Output, EventEmitter } from '@angular/core';
import { GreyscalePalette, RedPalette } from './DistancePalette';
import { TersectBackendService } from '../services/tersect-backend.service';
import { Chromosome } from '../models/chromosome';
import { PlotPosition, BinPosition } from '../models/PlotPosition';
import { forkJoin } from 'rxjs/observable/forkJoin';
import { DistanceMatrix } from '../models/DistanceMatrix';
import { njTreeSortAccessions } from '../clustering/clustering';

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

  private _autoupdate = false;

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
  private gui_offset = { x: 0, y: 0 };

  /**
   * Used to keep remember the position of a mouse press.
   * This is necessary to distinguish clicks (where the position doesn't change
   * between the press and release) from drags (where it does).
   */
  private mouse_down_position = { x: 0, y: 0 };

  /**
   * Current position / offset of the introgression plot.
   */
  private plot_position: PlotPosition = { x: 0, y: 0 };

  /**
   * Width of the accession labels.
   */
  private label_width = 0;

  private _chromosome: Chromosome;
  @Input()
  set chromosome(chrom: Chromosome) {
      this._chromosome = chrom;
      if (this._autoupdate) {
        this.generatePlot();
      }
  }

  private _interval: number[];
  @Input()
  set interval(interval: number[]) {
    this._interval = interval;
    if (this._autoupdate) {
      this.generatePlot();
    }
  }

  private _accession: string;
  @Input()
  set accession(accession: string) {
    this._accession = accession;
    if (this._autoupdate) {
      this.generatePlot();
    }
  }

  private _binsize: number;
  @Input()
  set binsize(binsize: number) {
    this._binsize = binsize;
    if (this._autoupdate) {
      this.generatePlot();
    }
  }

  private _plotted_accessions: string[];
  @Input()
  set plotted_accessions(accessions: string[]) {
    this._plotted_accessions = accessions;
    if (this._autoupdate) {
      this.generatePlot();
    }
  }

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
      this.drawGUI();
    }
  }
  get zoom_level(): number {
    return this._zoom_level;
  }

  /**
   * True if an update is due (or in the process of being generated), set to
   * false once a plot is generated.
   */
  private _update = true;
  @Input()
  set update(update: boolean) {
    this._update = update;
    if (this._update) {
      this.generatePlot();
    }
  }
  @Output() updateChange = new EventEmitter<boolean>();
  get update() {
    return this._update;
  }

  /**
   * Genetic distance bins between reference and other accessions for currently
   * viewed interval, fetched from tersect.
   */
  private distanceBins = {};

  /**
   * Pairwise genetic distance matrix between all accessions in database for
   * currently viewed interval, fetched from database or tersect.
   */
  private distanceMatrix: DistanceMatrix = null;

  /**
   * Accession names (as used by tersect, i.e. filenames) sorted in the order to
   * be displayed on the drawn plot. Generally this is the order based on
   * the neighbor joining tree clustering.
   */
  private sortedAccessions: string[] = [];

  constructor(private tersectBackendService: TersectBackendService) { }

  /**
   * Get an array of maximum distances per bin for a given distance table.
   * @param distance_table
   */
  private getMaxDistances(distance_table: object) {
    const max_distances = new Array(Object.values(distance_table)[0].length)
                                   .fill(0);
    Object.keys(distance_table).forEach(accession => {
      distance_table[accession].forEach((dist, i) => {
        if (dist > max_distances[i]) {
          max_distances[i] = dist;
        }
      });
    });
    return max_distances;
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
    this.gui_offset = {
      x: this.label_width / (this._zoom_level / 100),
      y: 0
    };
  }

  private drawAccessionLabels(canvas: ElementRef) {
    const ctx: CanvasRenderingContext2D = canvas.nativeElement.getContext('2d');
    const text_height = ((this._zoom_level / this.aspect_ratio) / 100);
    ctx.font = `${text_height}px Arial`;

    // TODO: simplify this
    const yoffset = Math.floor(((this.plot_position.y * (this._zoom_level / 100) / this.aspect_ratio) / text_height)) * text_height;
    this.label_width = Math.max(
      ...this.sortedAccessions.map(label => ctx.measureText(label).width)
    );
    // Draw background
    ctx.fillStyle = this.GUI_BG_COLOR;
    ctx.fillRect(0, 0, this.label_width, canvas.nativeElement.height);
    // Draw labels
    this.sortedAccessions.forEach((label, index) => {
      ctx.fillStyle = this.GUI_TEXT_COLOR;
      ctx.fillText(label, 0,
                   yoffset + (1 + index) * text_height - 2);
    });
  }

  drawPlot() {
    const ctx: CanvasRenderingContext2D = this.plotCanvas
                                              .nativeElement
                                              .getContext('2d');
    ctx.clearRect(0, 0, this.plotCanvas.nativeElement.width,
                  this.plotCanvas.nativeElement.height);
    const palette = new GreyscalePalette(ctx);
    const max_distances = this.getMaxDistances(this.distanceBins);
    // Object.keys(this.distanceBins).forEach((accession, accession_index) => {
    this.sortedAccessions.forEach((accession, accession_index) => {
      palette.distanceToColors(this.distanceBins[accession], max_distances)
             .forEach((color, bin_index) => {
        ctx.putImageData(color,
                         bin_index + this.plot_position.x
                         + this.gui_offset.x,
                         accession_index + this.plot_position.y
                         + this.gui_offset.y);
        // TODO: save created image instead of printing it directly to the canvas
      });
    });
  }

  ngOnInit() {
    this.generatePlot();
  }

  generatePlot() {
    if (!this._accession) { return; }
    // TODO: deal with this more elegantly (on the back-end)
    this.plotCanvas.nativeElement.parentElement.style.cursor = 'progress';
    if (this._interval[1] - this._interval[0] < this._binsize) {
      this._interval[1] = this._interval[0] + this._binsize;
    }
    const bins_fetch = this.tersectBackendService
                           .getRefDistanceBins(this._accession,
                                               this._chromosome.name,
                                               this._interval[0],
                                               this._interval[1],
                                               this._binsize);
    const matrix_fetch = this.tersectBackendService
                             .getDistanceMatrix(this._chromosome.name,
                                                this._interval[0],
                                                this._interval[1]);
    forkJoin([bins_fetch, matrix_fetch]).subscribe(([bins, distance_matrix]) => {
      this.distanceBins = bins;
      this.distanceMatrix = distance_matrix;
      this.sortedAccessions = njTreeSortAccessions(this.distanceMatrix,
                                                   this._plotted_accessions);
      this.updateCanvasSize();
      this.updatePlotZoom();
      this.drawGUI();
      /*if (this.plot_position.x === 0 && this.plot_position.y === 0) {
        this.plot_position = {
          x: this.label_width / (this._zoom_level / 100),
          y: 0
        };
      }*/
      this.drawPlot();
      this._update = false;
      this.updateChange.emit(this._update);
      this.plotCanvas.nativeElement.parentElement.style.cursor = 'auto';
    });
  }

  guiMouseMove(event) {
    if (this.dragging_plot) {
      this.dragPlot(event);
    } else {
      // console.log(event);
    }
  }

  guiMouseDown(event) {
    this.mouse_down_position = { x: event.layerX, y: event.layerY };
    this.startDrag(event);
  }

  guiMouseUp(event) {
    if (this.mouse_down_position.x === event.layerX
        && this.mouse_down_position.y === event.layerY) {
      console.log(this.plotToBinPosition(this.mouse_down_position));
      // this.plotToBinPosition(this.mouse_down_position);
    }
    this.stopDrag(event);
  }

  private plotToBinPosition(position: PlotPosition): BinPosition {
    const bin_width = this._zoom_level / 100;
    const text_height = ((this._zoom_level / this.aspect_ratio) / 100);
    // TODO: simplify this
    const yoffset = Math.floor(((this.plot_position.y * (this._zoom_level / 100) / this.aspect_ratio) / text_height)) * text_height;
    const label_index = Math.floor((position.y - 2 - yoffset) / text_height);
    if (label_index >= this.sortedAccessions.length) {
      return null;
    }
    const bin_index = Math.floor((position.x - this.label_width) / bin_width
                                 - this.plot_position.x - 0.5);
    console.log(bin_index);
    const start_pos = this._interval[0] + bin_index * this._binsize;
    if (start_pos < 1 || start_pos > this._interval[1]) {
      return null;
    }
    let end_pos = this._interval[0] + (bin_index + 1) * this._binsize;
    if (end_pos > this._interval[1]) {
      end_pos = this._interval[1];
    }
    return {
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
    /*if (this.plot_position.x > this.label_width) {
      this.plot_position.x = this.label_width;
    }*/
    if (this.plot_position.y > 0) {
      this.plot_position.y = 0;
    }
    this.previous_drag_position = { x: event.layerX, y: event.layerY };
    this.drawGUI();
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
    this.drawGUI();
    this.drawPlot();
  }

}

import { Component, OnInit, ViewChild, ElementRef, HostListener, Input, Output, EventEmitter } from '@angular/core';
import { GreyscalePalette, RedPalette } from './DistancePalette';
import { TersectBackendService } from '../services/tersect-backend.service';
import { Chromosome } from '../models/chromosome';
import { PlotPosition } from '../models/plot';

@Component({
  selector: 'app-introgression-plot',
  templateUrl: './introgression-plot.component.html',
  styleUrls: ['./introgression-plot.component.css']
})

export class IntrogressionPlotComponent implements OnInit {
  @ViewChild('plotCanvas') canvasRef: ElementRef;

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
   * Current position / offset of the introgression plot.
   */
  private plot_position: PlotPosition = { x: 0, y: 0 };

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

  private distance_table = {};

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
    this.canvasRef.nativeElement.style.width = `${this._zoom_level}%`;
    this.canvasRef.nativeElement.style.height = `${this._zoom_level
                                                   / this.aspect_ratio}%`;
  }

  /**
   * Zoom in ten percentage points at a time.
   */
  zoomIn() {
    this.zoom_level += 10;
    this.updatePlotZoom();
  }

  drawPlot() {
    this.updatePlotZoom();
    this.canvasRef.nativeElement.width = this.canvasRef.nativeElement
                                             .parentElement.parentElement
                                             .offsetWidth;
    this.canvasRef.nativeElement.height = this.canvasRef.nativeElement
                                              .parentElement.parentElement
                                              .offsetHeight;
    const ctx: CanvasRenderingContext2D = this.canvasRef
                                              .nativeElement
                                              .getContext('2d');
    const palette = new GreyscalePalette(ctx);

    const max_distances = this.getMaxDistances(this.distance_table);

    Object.keys(this.distance_table).forEach((accession, accession_index) => {
      palette.distanceToColors(this.distance_table[accession], max_distances)
             .forEach((color, bin_index) => {
        ctx.putImageData(color,
                         bin_index + this.plot_position.x,           // x axis
                         accession_index + this.plot_position.y);    // y axis
        // TODO: save created image instead of printing it directly to the canvas
      });
    });
  }

  ngOnInit() {
    this.generatePlot();
  }

  generatePlot() {
    // TODO: deal with this more elegantly (on the back-end)
    this.canvasRef.nativeElement.parentElement.style.cursor = 'progress';
    if (this._interval[1] - this._interval[0] < this._binsize) {
      this._interval[1] = this._interval[0] + this._binsize;
    }
    this.tersectBackendService.getDistances(this._accession, this._chromosome.name,
                                            this._interval[0],
                                            this._interval[1], this._binsize)
                              .subscribe(distances => {
      this.distance_table = distances;
      this.drawPlot();
      this._update = false;
      this.updateChange.emit(this._update);
      this.canvasRef.nativeElement.parentElement.style.cursor = 'auto';
    });
  }

  startDrag(event) {
    // drag on left mouse button
    if (event.buttons === 1) {
      this.dragging_plot = true;
      this.previous_drag_position = { x: event.clientX, y: event.clientY };
    }
  }

  drag(event) {
    if (event.buttons !== 1) {
      this.stopDrag(event);
      return;
    }
    if (this.dragging_plot) {
      console.log(event);
      this.plot_position.x += (event.clientX - this.previous_drag_position.x)
                              * 100 / this.zoom_level;
      this.plot_position.y += (event.clientY - this.previous_drag_position.y)
                              * this.aspect_ratio
                              * 100 / this.zoom_level;
      if (this.plot_position.x > 0) {
        this.plot_position.x = 0;
      }
      if (this.plot_position.y > 0) {
        this.plot_position.y = 0;
      }
      this.previous_drag_position = { x: event.clientX, y: event.clientY };
      this.drawPlot();
    }
  }

  stopDrag(event) {
    this.dragging_plot = false;
  }

  @HostListener('window:resize', ['$event'])
  onResize(event) {
    this.drawPlot();
  }

}

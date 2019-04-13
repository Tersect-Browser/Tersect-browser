import { Component, Input } from '@angular/core';
import { SelectItem } from 'primeng/components/common/selectitem';
import { Chromosome, SL2_50_chromosomes } from './models/chromosome';
import { accessions_510 } from './models/accessions';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  title = 'app';
  chromosomes: SelectItem[] = SL2_50_chromosomes;
  accessions: SelectItem[] = accessions_510;

  _selected_chromosome: Chromosome = this.chromosomes[0].value;
  @Input()
  set selected_chromosome(chrom: Chromosome) {
    // retaining the same selection proportions
    this.interval_max = chrom.size;
    if (this.selected_interval[0] >= this.interval_max - 10000) {
      this.selected_interval[0] = this.interval_max - 10000;
    }
    if (this.selected_interval[1] > this.interval_max) {
      this.selected_interval[1] = this.interval_max;
    }
    this._selected_chromosome = chrom;
  }
  get selected_chromosome(): Chromosome {
    return this._selected_chromosome;
  }

  _selected_accession = this.accessions[0].label;
  @Input()
  set selected_accession(accession: string) {
    this._selected_accession = accession;
  }
  get selected_accession() {
    return this._selected_accession;
  }

  _included_accessions = this.accessions.map(acc => acc.label);
  @Input()
  set included_accessions(accessions: string[]) {
    this._included_accessions = accessions;
  }
  get included_accessions(): string[] {
    return this._included_accessions;
  }

  /**
   * Number of miliseconds of delay between a plot update being requested
   * and the plot being redrawn. Further update requests during this period will
   * reset the delay timer so that multiple successive updates can happen
   * all at once instead of having the plot be redrawn multiple times.
   * This is particularly important for typed inputs (e.g. chromosomal
   * interval bounds) chanigng, as without a delay every keystroke would
   * case a redreaw.
   */
  readonly UPDATE_DELAY = 750;

  /**
   * Timer used to keep track of plot update delay.
   */
  private plot_update_timer;

  zoom_level = 100;

  display_sidebar = false;
  update_plot = false; // switch to true to trigger plot update
  interval_min = 1;
  interval_max = this.selected_chromosome.size;
  selected_interval = [this.interval_min, this.interval_max];

  binsize_min = 5000;
  binsize_step = 1000;
  binsize_max = 100000;
  selected_binsize = 50000;

  readonly MAX_ZOOM_LEVEL = 1000;
  readonly MIN_ZOOM_LEVEL = 100;
  zoomIn() {
    this.zoom_level *= 1.20;
    if (this.zoom_level > this.MAX_ZOOM_LEVEL) {
      this.zoom_level = this.MAX_ZOOM_LEVEL;
    }
  }
  zoomOut() {
    this.zoom_level /= 1.20;
    if (this.zoom_level < this.MIN_ZOOM_LEVEL) {
      this.zoom_level = this.MIN_ZOOM_LEVEL;
    }
  }
  scrollWheel(event: WheelEvent) {
    if (event.deltaY > 0) {
      this.zoomOut();
    } else {
      this.zoomIn();
    }
  }

  /**
   * Temporary (for updating sidebar accession selection)
   */
  update_selection() {
    this.update_plot = true;
  }

  updatePlot() {
    clearTimeout(this.plot_update_timer);
    this.plot_update_timer = setTimeout(() => this.update_plot = true,
                                        this.UPDATE_DELAY);
  }

}

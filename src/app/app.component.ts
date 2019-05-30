import { Component, Input, OnInit, ViewChild } from '@angular/core';
import { SelectItem } from 'primeng/components/common/selectitem';
import { Chromosome, SL2_50_chromosomes } from './models/chromosome';
import { TersectBackendService } from './services/tersect-backend.service';
import { ceilTo, floorTo } from './utils/utils';
import { PlotClickEvent } from './models/PlotPosition';
import { PlotClickMenuComponent } from './plot-click-menu/plot-click-menu.component';

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {

    @ViewChild(PlotClickMenuComponent) plotClickMenu: PlotClickMenuComponent;

    chromosomes: SelectItem[] = SL2_50_chromosomes;
    accessions: SelectItem[];

    constructor(private tersectBackendService: TersectBackendService) { }

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

    display_tree = false;

    selected_reference: string;

    widget_accessions: string[];
    selected_accessions: string[];

    zoom_level = 100;

    display_sidebar = false;

    interval_min = 1;
    interval_max = this.selected_chromosome.size;
    selected_interval: number[] = [this.interval_min, this.interval_max];

    binsize_min = 1000;
    binsize_step = 1000;
    binsize_max = 100000;
    selected_binsize = 50000;
    widget_binsize = this.selected_binsize;

    readonly TYPING_DELAY = 750;
    private interval_input_timeout;

    readonly BINSIZE_SLIDER_DELAY = 750;
    private binsize_slider_timeout;

    readonly MAX_ZOOM_LEVEL = 1000;
    readonly MIN_ZOOM_LEVEL = 100;
    readonly ZOOM_FACTOR = 1.3;
    readonly ZOOM_ROUND_TO = 50;

    zoomIn() {
        this.zoom_level *= this.ZOOM_FACTOR;
        this.zoom_level = ceilTo(this.zoom_level, this.ZOOM_ROUND_TO);
        if (this.zoom_level > this.MAX_ZOOM_LEVEL) {
            this.zoom_level = this.MAX_ZOOM_LEVEL;
        }
    }

    zoomOut() {
        this.zoom_level /= this.ZOOM_FACTOR;
        this.zoom_level = floorTo(this.zoom_level, this.ZOOM_ROUND_TO);
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

    ngOnInit() {
        this.loadAccessions();
    }

    loadAccessions() {
        this.tersectBackendService.getAccessionNames().subscribe(acc_names => {
            this.accessions = acc_names.map(n => ({ label: n, value: n }));
            this.widget_accessions = this.accessions.map(acc => acc.label);
            this.selected_accessions = this.widget_accessions;
            this.selected_reference = this.widget_accessions[0];
        });
    }

    typeInterval(event) {
        // fix to possible PrimeNG bug
        // numbers typed into text box are sometimes interpreted as strings
        const interval_start = parseInt(this.selected_interval[0].toString(), 10);
        const interval_end = parseInt(this.selected_interval[1].toString(), 10);
        if (!isNaN(interval_start)) {
            this.selected_interval[0] = interval_start;
        }
        if (!isNaN(interval_end)) {
            this.selected_interval[1] = interval_end;
        }
        // fix end
        clearTimeout(this.interval_input_timeout);
        this.interval_input_timeout = setTimeout(() => this.updateInterval(),
                                                 this.TYPING_DELAY);
    }

    updateInterval() {
        this.selected_interval = [this.selected_interval[0],
                                  this.selected_interval[1]];
    }

    updateAccessions() {
        if (!this.widget_accessions.includes(this.selected_reference)) {
            this.selected_reference = this.widget_accessions[0];
        }
        this.selected_accessions = this.widget_accessions.slice(0);
    }

    updateBinsize() {
        this.selected_binsize = this.widget_binsize;
    }

    intervalSliderChange($event) {
        if ($event.event.type === 'click') {
            this.updateInterval();
        }
    }

    binsizeSliderChange($event) {
        clearTimeout(this.binsize_slider_timeout);
        this.binsize_slider_timeout = setTimeout(() => this.updateBinsize(),
                                                 this.BINSIZE_SLIDER_DELAY);
    }

    plotClick($event: PlotClickEvent) {
        if ($event.target.type !== 'background') {
            this.plotClickMenu.show($event);
        }
    }

    setReference($event) {
        this.selected_reference = $event;
    }

    removeAccession($event) {
        this.widget_accessions.splice(
            this.widget_accessions.findIndex((acc) => acc === $event), 1
        );
        this.widget_accessions = this.widget_accessions.slice(0);
        this.updateAccessions();
    }

    setIntervalStart($event) {
        this.selected_interval[0] = $event;
        this.updateInterval();
    }

    setIntervalEnd($event) {
        this.selected_interval[1] = $event;
        this.updateInterval();
    }

}

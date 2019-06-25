import { Component, Input, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, ParamMap } from '@angular/router';

import { SelectItem } from 'primeng/components/common/selectitem';
import { Chromosome, SL2_50_chromosomes } from '../models/chromosome';
import { TersectBackendService } from '../services/tersect-backend.service';
import { ceilTo, floorTo } from '../utils/utils';
import { PlotClickMenuComponent } from '../plot-click-menu/plot-click-menu.component';
import { TooltipComponent } from '../tooltip/tooltip.component';
import { PlotMouseClickEvent } from '../models/PlotPosition';
import { BrowserSettings } from './browser-settings';
import { switchMap } from 'rxjs/operators';
import { AccessionDisplayStyle } from '../services/introgression-plot.service';
import { combineLatest } from 'rxjs/observable/combineLatest';
import { isNullOrUndefined } from 'util';

@Component({
    selector: 'app-introgression-browser',
    templateUrl: './introgression-browser.component.html',
    styleUrls: ['./introgression-browser.component.css']
})
export class IntrogressionBrowserComponent implements OnInit {
    @ViewChild(PlotClickMenuComponent) plotClickMenu: PlotClickMenuComponent;
    @ViewChild(TooltipComponent) tooltip: TooltipComponent;

    readonly DEFAULT_BINSIZE = 50000;
    readonly DEFAULT_DISPLAY_STYLE: AccessionDisplayStyle = 'labels';
    readonly DEFAULT_ZOOM_LEVEL = 100;

    chromosomes: SelectItem[] = SL2_50_chromosomes;
    accessions: SelectItem[];

    settings: BrowserSettings = {
        selectedAccessionDisplayStyle: this.DEFAULT_DISPLAY_STYLE,
        selected_accessions: undefined,
        selected_reference: undefined,
        selected_chromosome: this.chromosomes[0].value,
        selected_interval: [1, this.chromosomes[0].value.size],
        selected_binsize: this.DEFAULT_BINSIZE,
        zoom_level: this.DEFAULT_ZOOM_LEVEL
    };

    constructor(private tersectBackendService: TersectBackendService,
                private route: ActivatedRoute) {}

    @Input()
    set widget_chromosome(chrom: Chromosome) {
        if (this.settings.selected_chromosome.name !== chrom.name
            && this.settings.selected_chromosome.size !== chrom.size) {
            this.settings.selected_interval[0] = 1;
            this.settings.selected_interval[1] = chrom.size;
            this.updateInterval();
            this.settings.selected_chromosome = chrom;
        }
    }
    get widget_chromosome(): Chromosome {
        return this.settings.selected_chromosome;
    }

    display_tree = false;

    widget_accessions: string[];

    display_sidebar = false;

    binsize_min = 1000;
    binsize_step = 1000;
    binsize_max = 100000;

    widget_binsize: number;

    readonly TYPING_DELAY = 750;
    private interval_input_timeout: NodeJS.Timer;

    readonly BINSIZE_SLIDER_DELAY = 750;
    private binsize_slider_timeout: NodeJS.Timer;

    readonly MAX_ZOOM_LEVEL = 1000;
    readonly MIN_ZOOM_LEVEL = 100;
    readonly ZOOM_FACTOR = 1.3;
    readonly ZOOM_ROUND_TO = 50;

    zoomIn() {
        this.settings.zoom_level *= this.ZOOM_FACTOR;
        this.settings.zoom_level = ceilTo(this.settings.zoom_level,
                                          this.ZOOM_ROUND_TO);
        if (this.settings.zoom_level > this.MAX_ZOOM_LEVEL) {
            this.settings.zoom_level = this.MAX_ZOOM_LEVEL;
        }
    }

    zoomOut() {
        this.settings.zoom_level /= this.ZOOM_FACTOR;
        this.settings.zoom_level = floorTo(this.settings.zoom_level,
                                           this.ZOOM_ROUND_TO);
        if (this.settings.zoom_level < this.MIN_ZOOM_LEVEL) {
            this.settings.zoom_level = this.MIN_ZOOM_LEVEL;
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
        const accessions$ = this.tersectBackendService.getAccessionNames();
        const settings$ = this.route.paramMap.pipe(
            switchMap((params: ParamMap) => {
                return this.tersectBackendService
                           .getExportedSettings(params.get('exportid'));
            })
        );
        combineLatest(accessions$, settings$).subscribe(([accessions,
                                                          settings]) => {
            this.accessions = accessions.map((n: string) => ({
                label: n,
                value: n
            }));
            if (isNullOrUndefined(settings)) {
                this.loadDefaultSettings();
            }
            this.widget_accessions = this.settings.selected_accessions;
            this.widget_binsize = this.settings.selected_binsize;
            this.widget_chromosome = this.settings.selected_chromosome;
        });
    }

    loadDefaultSettings() {
        this.settings
            .selectedAccessionDisplayStyle = this.DEFAULT_DISPLAY_STYLE;
        this.settings
            .selected_accessions = this.accessions.map(acc => acc.label);
        this.settings
            .selected_reference = this.settings.selected_accessions[0];
        this.settings
            .selected_binsize = this.DEFAULT_BINSIZE;
        this.settings.selected_chromosome = this.chromosomes[0].value;
        this.settings.zoom_level = this.DEFAULT_ZOOM_LEVEL;
        this.settings.selected_interval = [
            1, this.settings.selected_chromosome.size
        ];
    }

    typeInterval(event) {
        // fix to possible PrimeNG bug
        // numbers typed into text box are sometimes interpreted as strings
        const interval_start = parseInt(this.settings.selected_interval[0]
                                                     .toString(), 10);
        const interval_end = parseInt(this.settings.selected_interval[1]
                                                   .toString(), 10);
        if (!isNaN(interval_start)) {
            this.settings.selected_interval[0] = interval_start;
        }
        if (!isNaN(interval_end)) {
            this.settings.selected_interval[1] = interval_end;
        }
        // fix end
        clearTimeout(this.interval_input_timeout);
        this.interval_input_timeout = setTimeout(() => this.updateInterval(),
                                                 this.TYPING_DELAY);
    }

    updateInterval() {
        this.settings.selected_interval = [
            this.settings.selected_interval[0],
            this.settings.selected_interval[1]
        ];
    }

    updateAccessions() {
        if (!this.widget_accessions.includes(this.settings.selected_reference)) {
            this.settings.selected_reference = this.widget_accessions[0];
        }
        this.settings.selected_accessions = this.widget_accessions.slice(0);
    }

    updateBinsize() {
        this.settings.selected_binsize = this.widget_binsize;
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

    plotClick($event: PlotMouseClickEvent) {
        if ($event.target.type !== 'background') {
            this.plotClickMenu.show($event);
        }
    }

    setReference($event) {
        this.settings.selected_reference = $event;
    }

    removeAccession($event) {
        this.widget_accessions.splice(
            this.widget_accessions.findIndex((acc) => acc === $event), 1
        );
        this.widget_accessions = this.widget_accessions.slice(0);
        this.updateAccessions();
    }

    setInterval($event: number[]) {
        this.settings.selected_interval = $event;
    }

    setIntervalStart($event) {
        this.settings.selected_interval[0] = $event;
        this.updateInterval();
    }

    setIntervalEnd($event) {
        this.settings.selected_interval[1] = $event;
        this.updateInterval();
    }

}

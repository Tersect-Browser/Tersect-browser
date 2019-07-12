import { Component, Input, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, ParamMap } from '@angular/router';
import { PlatformLocation } from '@angular/common';

import { SelectItem } from 'primeng/components/common/selectitem';
import { Chromosome } from '../models/Chromosome';
import { TersectBackendService } from '../services/tersect-backend.service';
import { ceilTo, floorTo, formatPosition } from '../utils/utils';
import { PlotClickMenuComponent } from '../plot-click-menu/plot-click-menu.component';
import { TooltipComponent } from '../tooltip/tooltip.component';
import { PlotMouseClickEvent } from '../models/PlotPosition';
import { BrowserSettings } from './browser-settings';
import { switchMap } from 'rxjs/operators';
import { AccessionDisplayStyle } from '../services/introgression-plot.service';
import { combineLatest } from 'rxjs/observable/combineLatest';
import { isNullOrUndefined } from 'util';

import * as path from 'path';

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
    readonly DEFAULT_DATASET = 'Tomato';

    chromosomes: SelectItem[];
    accessions: SelectItem[];

    settings: BrowserSettings = {
        dataset_id: this.DEFAULT_DATASET,
        selectedAccessionDisplayStyle: this.DEFAULT_DISPLAY_STYLE,
        selected_accessions: undefined,
        selected_reference: undefined,
        selected_chromosome: { name: '', size: 0 },
        selected_interval: [1, 2 * this.DEFAULT_BINSIZE],
        selected_binsize: this.DEFAULT_BINSIZE,
        zoom_level: this.DEFAULT_ZOOM_LEVEL
    };

    constructor(private tersectBackendService: TersectBackendService,
                private route: ActivatedRoute,
                private platformLocation: PlatformLocation) { }

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

    share_link = '';

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

    /**
     * Create array of chromosome SelectItems based on array of chromosomes.
     */
    formatChromosomeSelection(chromosomes: Chromosome[]): SelectItem[] {
        return chromosomes.map((chrom: Chromosome) => ({
            label: `${chrom.name} (${formatPosition(chrom.size, 'Mbp')})`,
            value: chrom
        }));
    }

    ngOnInit() {
        const accessions$ = this.tersectBackendService
                                .getAccessionNames(this.settings.dataset_id);
        const chromosomes$ = this.tersectBackendService
                                 .getChromosomes(this.settings.dataset_id);
        const settings$ = this.route.paramMap.pipe(
            switchMap((params: ParamMap) => {
                return this.tersectBackendService
                           .getExportedSettings(params.get('exportid'));
            })
        );
        combineLatest(accessions$,
                      chromosomes$,
                      settings$).subscribe(([accessions,
                                             chromosomes,
                                             settings]) => {
            this.accessions = accessions.map((n: string) => ({
                label: n,
                value: n
            }));
            this.chromosomes = this.formatChromosomeSelection(chromosomes);
            if (isNullOrUndefined(settings)) {
                this.loadDefaultSettings();
            } else {
                this.settings = settings;
            }
            this.widget_accessions = this.settings.selected_accessions;
            this.widget_binsize = this.settings.selected_binsize;
            this.widget_chromosome = this.settings.selected_chromosome;
        });
    }

    exportView($event) {
        this.tersectBackendService.exportSettings(this.settings)
                                  .subscribe((id) => {
            const host = this.platformLocation['location'].origin;
            this.share_link = path.join(host, 'TersectBrowser', 'share',
                                        id.toString());
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
            this.settings.selected_interval[0] = 1;
            this.settings.selected_interval[1] = this.settings
                                                     .selected_chromosome.size;
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

    /**
     * Copy view share link to clipboard.
     */
    copyLink($event) {
        document.addEventListener('copy', ($e: ClipboardEvent) => {
            $e.clipboardData.setData('text/plain', this.share_link);
            $e.preventDefault();
            document.removeEventListener('copy', null);
        });
        document.execCommand('copy');
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

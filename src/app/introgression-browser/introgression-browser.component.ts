import { formatPosition } from '../utils/utils';
import { PlotClickMenuComponent } from '../plot-click-menu/plot-click-menu.component';
import { TooltipComponent } from '../tooltip/tooltip.component';
import { Chromosome } from '../models/Chromosome';
import { PlotMouseClickEvent } from '../models/PlotPosition';
import { BrowserSettings, AccessionDictionary } from './browser-settings';
import { AccessionDisplayStyle } from '../introgression-plot/services/introgression-plot.service';
import { TersectBackendService } from '../services/tersect-backend.service';
import { PlotStateService } from '../introgression-plot/services/plot-state.service';
import { AccessionRow, AccessionGroup } from '../accession-tab/accession-tab.component';

import { Component, OnInit, ViewChild, OnDestroy } from '@angular/core';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { PlatformLocation } from '@angular/common';
import { isNullOrUndefined } from 'util';
import { forkJoin, Subscription } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { SelectItem } from 'primeng/components/common/selectitem';
import { join } from 'path';

@Component({
    selector: 'app-introgression-browser',
    templateUrl: './introgression-browser.component.html',
    styleUrls: ['./introgression-browser.component.css'],
    providers: [ PlotStateService ]
})
export class IntrogressionBrowserComponent implements OnInit, OnDestroy {
    @ViewChild(PlotClickMenuComponent, { static: true })
    plotClickMenu: PlotClickMenuComponent;

    @ViewChild(TooltipComponent, { static: true })
    tooltip: TooltipComponent;

    accession_groups: AccessionGroup[] = [];

    readonly DEFAULT_BINSIZE = 50000;
    readonly DEFAULT_DISPLAY_STYLE: AccessionDisplayStyle = 'labels';
    readonly DEFAULT_ZOOM_LEVEL = 100;

    chromosomes: SelectItem[];
    accessions: SelectItem[];
    accessions_full: AccessionRow[];

    constructor(private plotState: PlotStateService,
                private tersectBackendService: TersectBackendService,
                private router: Router,
                private route: ActivatedRoute,
                private platformLocation: PlatformLocation) { }

    set widget_chromosome(chrom: Chromosome) {
        if (this.plotState.chromosome.name !== chrom.name
            || this.plotState.chromosome.size !== chrom.size) {
            this.plotState.interval = [1, chrom.size];
            this.plotState.chromosome = chrom;
        }
    }
    get widget_chromosome(): Chromosome {
        return this.plotState.chromosome;
    }

    set widget_accession_style(style: AccessionDisplayStyle) {
        this.plotState.accession_style = style;
    }
    get widget_accession_style(): AccessionDisplayStyle {
        return this.plotState.accession_style;
    }

    set widget_reference(reference: string) {
        this.plotState.reference = reference;
    }
    get widget_reference(): string {
        return this.plotState.reference;
    }

    get accession_dictionary(): AccessionDictionary {
        return this.plotState.accession_dictionary;
    }

    readonly TYPING_DELAY = 750;
    private interval_input_timeout: NodeJS.Timer;
    widget_interval: number[] = [0, 0];

    readonly BINSIZE_SLIDER_DELAY = 750;
    private binsize_slider_timeout: NodeJS.Timer;
    binsize_min = 1000;
    binsize_step = 1000;
    binsize_max = 100000;
    widget_binsize: number;

    widget_accessions: string[];

    share_link = '';

    display_tree = false;
    display_sidebar = false;

    interval_sub: Subscription;

    zoomIn() {
        this.plotState.zoomIn();
    }

    zoomOut() {
        this.plotState.zoomOut();
    }

    isZoomMax(): boolean {
        return this.plotState.isZoomMax();
    }

    isZoomMin(): boolean {
        return this.plotState.isZoomMin();
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

    /**
     * Create array of simple accession options.
     */
    formatAccessionOptionsSimple(accession_ids: string[]): SelectItem[] {
        return accession_ids.map((acc: string) => ({
            label: this.plotState.accession_dictionary[acc],
            value: acc
        }));
    }

    /**
     * Create full array of accession options.
     */
    formatAccessionOptions(accession_ids: string[]): AccessionRow[] {
        return accession_ids.map((acc: string) => ({
            id: acc,
            name: this.plotState.accession_dictionary[acc]
        }));
    }

    ngOnInit() {
        const settings$ = this.route.paramMap.pipe(
            switchMap((params: ParamMap) => {
                return this.tersectBackendService
                           .getExportedSettings(params.get('exportid'));
            })
        );
        settings$.subscribe(settings => {
            if (isNullOrUndefined(settings)) {
                this.router.navigate(['']);
                return;
            }
            const accessions$ = this.tersectBackendService
                                    .getAccessionNames(settings.dataset_id);
            const chromosomes$ = this.tersectBackendService
                                     .getChromosomes(settings.dataset_id);
            forkJoin([accessions$, chromosomes$]).subscribe(([accessions,
                                                              chromosomes]) => {
                this.generateMissingSettings(settings, accessions, chromosomes);
                this.plotState.settings = settings;
                this.accessions = this.formatAccessionOptionsSimple(accessions);
                this.accessions_full = this.formatAccessionOptions(accessions);
                this.chromosomes = this.formatChromosomeSelection(chromosomes);
                this.widget_accessions = settings.selected_accessions;
                this.widget_binsize = settings.selected_binsize;
                this.widget_chromosome = settings.selected_chromosome;
                this.interval_sub = this.plotState.interval$
                                                  .subscribe((interval) => {
                    // Creating new interval array to ensure widget update
                    this.widget_interval = [...interval];
                });
            });
        });
    }

    ngOnDestroy() {
        if (!isNullOrUndefined(this.interval_sub)) {
            this.interval_sub.unsubscribe();
        }
    }

    exportView($event) {
        this.tersectBackendService.exportSettings(this.plotState.settings)
                                  .subscribe((id) => {
            const host = this.platformLocation['location'].origin;
            this.share_link = join(host, 'TersectBrowser', 'share',
                                   id.toString());
        });
    }

    /**
     * Load default values for missing settings.
     */
    generateMissingSettings(settings: BrowserSettings,
                            accessions: string[],
                            chromosomes: Chromosome[]) {
        if (isNullOrUndefined(settings.accession_style)) {
            settings.accession_style = this.DEFAULT_DISPLAY_STYLE;
        }
        if (isNullOrUndefined(settings.selected_accessions)) {
            settings.selected_accessions = accessions;
        }
        if (isNullOrUndefined(settings.selected_reference)) {
            settings.selected_reference = settings.selected_accessions[0];
        }
        if (isNullOrUndefined(settings.selected_binsize)) {
            settings.selected_binsize = this.DEFAULT_BINSIZE;
        }
        if (isNullOrUndefined(settings.selected_chromosome)) {
            // Selecting the largest chromosome
            const largest_chrom = chromosomes.reduce((prev, current) => {
                return (current.size > prev.size) ? current : prev;
            });
            settings.selected_chromosome = largest_chrom;
        }
        if (isNullOrUndefined(settings.zoom_level)) {
            settings.zoom_level = this.DEFAULT_ZOOM_LEVEL;
        }
        if (isNullOrUndefined(settings.selected_interval)) {
            settings.selected_interval = [
                1, settings.selected_chromosome.size
            ];
        }
        if (isNullOrUndefined(settings.accession_dictionary)) {
            settings.accession_dictionary = {};
            settings.selected_accessions.forEach((acc_name) => {
                settings.accession_dictionary[acc_name] = acc_name;
            });
        }
    }

    typeInterval(event) {
        // workaround due to possible PrimeNG bug
        // numbers typed into text box are sometimes interpreted as strings
        const interval_start = parseInt(this.widget_interval[0].toString(), 10);
        const interval_end = parseInt(this.widget_interval[1].toString(), 10);
        if (!isNaN(interval_start)) {
            this.widget_interval[0] = interval_start;
        }
        if (!isNaN(interval_end)) {
            this.widget_interval[1] = interval_end;
        }
        // fix end
        clearTimeout(this.interval_input_timeout);
        this.interval_input_timeout = setTimeout(() => this.updateInterval(),
                                                 this.TYPING_DELAY);
    }

    updateInterval() {
        this.plotState.interval = this.widget_interval;
    }

    updateAccessions() {
        if (!this.widget_accessions.includes(this.plotState.reference)) {
            this.plotState.reference = this.widget_accessions[0];
        }
        this.plotState.accessions = this.widget_accessions.slice(0);
    }

    updateBinsize() {
        this.plotState.binsize = this.widget_binsize;
    }

    intervalSliderChange($event) {
        // Selecting full chromosome on click
        if ($event.event.type === 'click') {
            this.plotState.interval = [1, this.plotState.chromosome.size];
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
        this.plotState.reference = $event;
    }

    removeAccession($event) {
        this.widget_accessions.splice(
            this.widget_accessions.findIndex((acc) => acc === $event), 1
        );
        this.widget_accessions = this.widget_accessions.slice(0);
        this.updateAccessions();
    }

    setInterval($event: number[]) {
        this.plotState.interval = $event;
    }

    setIntervalStart($event) {
        this.plotState.interval = [$event, this.plotState.interval[1]];
    }

    setIntervalEnd($event) {
        this.plotState.interval = [this.plotState.interval[0], $event];
    }

}

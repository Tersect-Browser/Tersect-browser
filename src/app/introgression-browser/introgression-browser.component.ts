import { PlotClickMenuComponent } from '../plot-click-menu/plot-click-menu.component';
import { TooltipComponent } from '../tooltip/tooltip.component';
import { Chromosome } from '../models/Chromosome';
import { PlotMouseClickEvent } from '../models/PlotPosition';
import { BrowserSettings, AccessionDisplayStyle, AccessionGroup, AccessionInfo } from './browser-settings';
import { TersectBackendService } from '../services/tersect-backend.service';
import { PlotStateService } from '../introgression-plot/services/plot-state.service';

import { Component, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { isNullOrUndefined } from 'util';
import { forkJoin } from 'rxjs';
import { switchMap } from 'rxjs/operators';

@Component({
    selector: 'app-introgression-browser',
    templateUrl: './introgression-browser.component.html',
    styleUrls: [
        './introgression-browser.component.css',
        './introgression-browser.widgets.css'
    ],
    providers: [ PlotStateService ]
})
export class IntrogressionBrowserComponent implements OnInit {
    @ViewChild(PlotClickMenuComponent, { static: true })
    plotClickMenu: PlotClickMenuComponent;

    @ViewChild(TooltipComponent, { static: true })
    tooltip: TooltipComponent;

    readonly DEFAULT_BINSIZE = 50000;
    readonly DEFAULT_DISPLAY_STYLE: AccessionDisplayStyle = 'labels';
    readonly DEFAULT_ZOOM_LEVEL = 100;

    chromosomes: Chromosome[];

    constructor(private plotState: PlotStateService,
                private tersectBackendService: TersectBackendService,
                private router: Router,
                private route: ActivatedRoute) { }

    set widget_reference(reference: string) {
        this.plotState.reference = reference;
    }
    get widget_reference(): string {
        return this.plotState.reference;
    }

    get accession_infos(): AccessionInfo[] {
        return this.plotState.accession_infos;
    }

    get plugins(): string[] {
        return this.plotState.plugins;
    }

    set widget_interval(interval: number[]) {
        this.plotState.interval = interval;
    }
    get widget_interval(): number[] {
        return this.plotState.interval;
    }

    widget_accessions: string[];

    widget_accession_groups: AccessionGroup[];

    display_tree = false;
    display_sidebar = false;

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

    ngOnInit() {
        const settings$ = this.route.paramMap.pipe(
            switchMap(params => {
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
                this.chromosomes = chromosomes;
                this.widget_accession_groups = settings.accession_groups;
                this.widget_accessions = settings.selected_accessions;
            });
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
        if (isNullOrUndefined(settings.accession_groups)) {
            settings.accession_groups = [];
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
        if (isNullOrUndefined(settings.accession_infos)) {
            settings.accession_infos = settings.selected_accessions
                                               .map(acc_id => ({
                id: acc_id,
                Label: acc_id
            }));
        }
        if (isNullOrUndefined(settings.plugins)) {
            settings.plugins = [];
        }
    }

    updateAccessions() {
        this.plotState.accessions = this.widget_accessions.slice(0);
        this.plotState.accession_groups = this.widget_accession_groups;
        if (!this.widget_accessions.includes(this.plotState.reference)) {
            this.plotState.reference = this.widget_accessions[0];
        }
    }

    plotClick($event: PlotMouseClickEvent) {
        if ($event.target.type !== 'background') {
            this.plotClickMenu.show($event);
        }
    }

    setReference($event) {
        this.plotState.reference = $event;
    }

    removeAccession($event) {
        this.widget_accessions.splice(
            this.widget_accessions.findIndex(acc => acc === $event), 1
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

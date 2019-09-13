
import { Component, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { forkJoin } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import {
    PlotStateService
} from '../introgression-plot/services/plot-state.service';
import {
    PlotZoomService
} from '../introgression-plot/services/plot-zoom.service';
import {
    Chromosome
} from '../models/Chromosome';
import {
    PlotMouseClickEvent
} from '../models/Plot';
import {
    PlotClickMenuComponent
} from '../plot-click-menu/plot-click-menu.component';
import {
    TersectBackendService
} from '../services/tersect-backend.service';
import {
    TooltipComponent
} from '../tooltip/tooltip.component';
import {
    isNullOrUndefined
} from '../utils/utils';
import {
    AccessionDisplayStyle,
    AccessionGroup,
    BrowserSettings
} from './browser-settings';

@Component({
    selector: 'app-introgression-browser',
    templateUrl: './introgression-browser.component.html',
    styleUrls: [
        './introgression-browser.component.css',
        './introgression-browser.widgets.css'
    ],
    providers: [ PlotZoomService ]
})
export class IntrogressionBrowserComponent implements OnInit {
    static readonly DEFAULT_BINSIZE = 50000;
    static readonly DEFAULT_DISPLAY_STYLE: AccessionDisplayStyle = 'labels';
    static readonly DEFAULT_ZOOM_LEVEL = 100;

    @ViewChild(PlotClickMenuComponent, { static: true })
    private readonly plotClickMenu: PlotClickMenuComponent;

    @ViewChild(TooltipComponent, { static: true })
    readonly tooltip: TooltipComponent;

    accessionGroups: AccessionGroup[];
    chromosomes: Chromosome[];
    displaySidebar = false;

    /**
     * The following two properties are used to store accession tab outputs
     * locally before the plot state is updated once the sidebar containing
     * the tab is closed.
     */
    selectedAccessions: string[];

    constructor(private readonly plotState: PlotStateService,
                private readonly plotZoom: PlotZoomService,
                private readonly tersectBackendService: TersectBackendService,
                private readonly router: Router,
                private readonly route: ActivatedRoute) { }

    get settings(): BrowserSettings {
        return this.plotState.settings;
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
                this.accessionGroups = settings.accession_groups;
                this.selectedAccessions = settings.selected_accessions;
            });
        });
    }

    isZoomMax(): boolean {
        return this.plotZoom.isZoomMax();
    }

    isZoomMin(): boolean {
        return this.plotZoom.isZoomMin();
    }

    plotClick($event: PlotMouseClickEvent) {
        if ($event.target.plotAreaType !== 'background') {
            this.plotClickMenu.show($event);
        }
    }

    removeAccession($event: string) {
        this.selectedAccessions.splice(
            this.selectedAccessions.findIndex(acc => acc === $event), 1
        );
        this.selectedAccessions = [...this.selectedAccessions];
        this.updateAccessions();
    }

    scrollWheel(event: WheelEvent) {
        if (event.deltaY > 0) {
            this.zoomOut();
        } else {
            this.zoomIn();
        }
    }

    setInterval($event: number[]) {
        this.plotState.interval = $event;
    }

    setIntervalEnd($event: number) {
        this.plotState.interval = [this.plotState.interval[0], $event];
    }

    setIntervalStart($event: number) {
        this.plotState.interval = [$event, this.plotState.interval[1]];
    }

    setReference($event: string) {
        this.plotState.reference = $event;
    }

    updateAccessions() {
        this.plotState.accessions = [...this.selectedAccessions];
        this.plotState.accessionGroups = [...this.accessionGroups];
        if (!this.selectedAccessions.includes(this.plotState.reference)) {
            this.plotState.reference = this.selectedAccessions[0];
        }
    }

    zoomIn() {
        this.plotZoom.zoomIn();
    }

    zoomOut() {
        this.plotZoom.zoomOut();
    }

    /**
     * Load default values for missing settings.
     */
    private generateMissingSettings(settings: BrowserSettings,
                                    accessions: string[],
                                    chromosomes: Chromosome[]) {
        if (isNullOrUndefined(settings.accession_style)) {
            settings.accession_style = IntrogressionBrowserComponent.DEFAULT_DISPLAY_STYLE;
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
            settings.selected_binsize = IntrogressionBrowserComponent.DEFAULT_BINSIZE;
        }
        if (isNullOrUndefined(settings.selected_chromosome)) {
            // Selecting the largest chromosome
            const largestChrom = chromosomes.reduce((prev, current) => {
                return (current.size > prev.size) ? current : prev;
            });
            settings.selected_chromosome = largestChrom;
        }
        if (isNullOrUndefined(settings.zoom_level)) {
            settings.zoom_level = IntrogressionBrowserComponent.DEFAULT_ZOOM_LEVEL;
        }
        if (isNullOrUndefined(settings.selected_interval)) {
            settings.selected_interval = [
                1, settings.selected_chromosome.size
            ];
        }
        if (isNullOrUndefined(settings.accession_infos)) {
            settings.accession_infos = settings.selected_accessions
                                               .map(accId => ({
                id: accId,
                Label: accId
            }));
        }
        if (isNullOrUndefined(settings.plugins)) {
            settings.plugins = [];
        }
    }
}

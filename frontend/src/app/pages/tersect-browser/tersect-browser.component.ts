import { Component, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin, Subscription } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import {
    PlotClickMenuComponent
} from '../../components/plot-click-menu/plot-click-menu.component';
import {
    AccessionDisplayStyle,
    AccessionGroup
} from '../../components/tersect-distance-plot/models/PlotState';
import {
    PlotStateService
} from '../../components/tersect-distance-plot/services/plot-state.service';
import {
    TersectDistancePlotComponent
} from '../../components/tersect-distance-plot/tersect-distance-plot.component';
import {
    TooltipComponent
} from '../../components/tooltip/tooltip.component';
import {
    Chromosome
} from '../../models/Chromosome';
import {
    PlotMouseClickEvent
} from '../../models/Plot';
import {
    TersectBackendService
} from '../../services/tersect-backend.service';
import {
    isNullOrUndefined
} from '../../utils/utils';
import {
    BrowserSettings
} from './models/BrowserSettings';
import {
    PlotZoomService
} from './services/plot-zoom.service';
import { PlotCreatorService } from '../../components/tersect-distance-plot/services/plot-creator.service';
import { TreeDrawService } from '../../services/tree-draw.service';

import {TreePlotComponent} from '../../components/tersect-distance-plot/components/tree-plot/tree-plot.component';

import { BinDrawService } from '../../services/bin-draw.service';

@Component({
    selector: 'app-tersect-browser',
    templateUrl: './tersect-browser.component.html',
    styleUrls: [
        './tersect-browser.component.css',
        './tersect-browser.widgets.css'
    ],
    providers: [
        PlotStateService,
        PlotZoomService,
        TreeDrawService,
        BinDrawService,
    ]
})
export class TersectBrowserComponent implements OnInit {
    static readonly DEFAULT_BINSIZE = 50000;
    static readonly DEFAULT_DISPLAY_STYLE: AccessionDisplayStyle = 'labels';
    static readonly DEFAULT_ZOOM_LEVEL = 100;
    zoomLevel: number = 0;
    binSize: number = this.plotState.binsize;
    selectedChromosomeSub: Chromosome;
    selectedInterval: number[];
    defaultInterval: number[];
    // offsetWidth: TreePlotComponent;
    offsetCanvas: number;

    chromosomeArray: Chromosome[] = [];
    
   
    private zoomSub: Subscription;
    private binSizeSub: Subscription;
    private accessionSub: Subscription;
    private chromosomeSub: Subscription;
    private selectedIntervalSub: Subscription;
    private offsetCanvasSub: Subscription;

    @ViewChild(TersectDistancePlotComponent, { static: true })
    readonly distancePlot: TersectDistancePlotComponent;

    @ViewChild(TooltipComponent, { static: true })
    readonly tooltip: TooltipComponent;

    @ViewChild(PlotClickMenuComponent, { static: true })
    private readonly plotClickMenu: PlotClickMenuComponent;

    accessionGroups: AccessionGroup[];
    chromosomes: Chromosome[];
    displaySidebar = false;
    displayButton = false;
    selectedAccessions: string[];
    preselectedChromosome: Chromosome;

    // ✅ NEW: flag to track when the custom element is ready
    isJbrowserReady: boolean = false;

    constructor(private readonly plotState: PlotStateService,
                private readonly plotZoom: PlotZoomService,
                private readonly drawBin: BinDrawService,
                private readonly tersectBackendService: TersectBackendService,
                private readonly treeDrawService: TreeDrawService,
                // private readonly treePlotCopmonent: TreePlotComponent,
                private readonly router: Router,
                private readonly route: ActivatedRoute) { }

    get settings(): BrowserSettings {
        return this.plotState.settings;
    }

    ngOnInit() {


        this.zoomSub = this.plotState.zoomLevel$.subscribe(level => {
            this.zoomLevel = level;
          });

        this.binSizeSub =  this.plotState.binsize$.subscribe(value => {
            this.binSize = value
        });

        this.chromosomeSub = this.plotState.chromosome$.subscribe(chromosome => {
            this.selectedChromosomeSub = chromosome;
            console.log('what is a chromosome', this.selectedChromosomeSub);
        })

        this.selectedIntervalSub = this.plotState.interval$.subscribe(value => {
            this.selectedInterval = value;
            console.log('tracking selectedInterval', this.selectedInterval);
        })

        this.offsetCanvasSub = this.plotState.offsetCanvas$.subscribe(value => {
            this.offsetCanvas = value;
            console.log('tracking offset', this.offsetCanvas);
        })


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

            const accessions$ = this.tersectBackendService.getAccessionNames(settings.dataset_id);
            const chromosomes$ = this.tersectBackendService.getChromosomes(settings.dataset_id);

            forkJoin([accessions$, chromosomes$]).subscribe(([accessions, chromosomes]) => {
                this.generateMissingSettings(settings, accessions, chromosomes);
                this.plotState.settings = settings;
                this.chromosomes = chromosomes;
                this.accessionGroups = settings.accession_groups;
                this.selectedAccessions = settings.selected_accessions;
                this.preselectedChromosome = this.plotState.chromosome;
            });

            
            
        });


        // ✅ Wait for jbrowser-wrapper to be defined before rendering
        customElements.whenDefined('jbrowser-wrapper').then(() => {
            this.isJbrowserReady = true;
        });
    }

    ngOnDestroy() {
        if (this.zoomSub) {
          this.zoomSub.unsubscribe();
        }
        if (this.binSizeSub){
            this.binSizeSub.unsubscribe()
        }
    }

    isDownloadReady(): boolean {
        return this.plotState.plotLoadMessage !== ''
               || this.plotState.errorMessages.size > 0;
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

    callHighlightBins(start:number, chromosome:string){
        console.log('callHighlightBins called');
        
        // Function to determine bin index position, given a fixed chromosome position
        function getBinIndexFromPosition(position: number, intervalStart: number, binsize: number): number {
            return Math.floor((position - intervalStart) / binsize);
        }

        // Define position based on startGenePosition passed from gene-search feature
        let position = start;

        // Calculate the binIndex
        const binIndex = getBinIndexFromPosition(position, this.selectedInterval[0], this.binSize)

        // TODO - Accept a list of accession names passed from gene-search feature
        // Currently, static list of accession names used
        const names = ['S_lyc_B_TS-174', 'S_lyc_B_TS-80', 'S_lyc_B_TS-179']

        // Pass the array of accession names and binIndex to bin-draw.service.ts to highlight bins
        this.drawBin.setAccessions(names);
        this.drawBin.setBinIndex(binIndex);
        const changeChromsome: Chromosome = {
            name: chromosome,
            size:  98543444
        }

        this.plotState.chromosomeSource.next(changeChromsome);
    }


    //this.plotState.offsetCanvasSource.next(this.storedTreeView.offscreenCanvas.width);

    startGenePosition: number | null = null; // Variable to hold the gene position from the child
    geneChrom: string | undefined = undefined;

    // This function is called when the event is emitted from the child
    handleGenePositionChanged(startGenePosition: number) {
        this.startGenePosition = startGenePosition;
        console.log('Received gene start position in parent:', this.startGenePosition);
    }
    
    handleGeneChromChanged(geneChrom: string){
        this.geneChrom = geneChrom;
    }

    /**
     * Load default values for missing settings.
     */
    private generateMissingSettings(settings: BrowserSettings,
                                    accessions: string[],
                                    chromosomes: Chromosome[]) {
        if (isNullOrUndefined(settings.accession_style)) {
            settings.accession_style = TersectBrowserComponent.DEFAULT_DISPLAY_STYLE;
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
            settings.selected_binsize = TersectBrowserComponent.DEFAULT_BINSIZE;
        }
        if (isNullOrUndefined(settings.selected_chromosome)) {
            console.log('chromosomes here ----------', chromosomes)
            this.chromosomeArray = chromosomes;
            console.log('saved chromosomes', this.chromosomeArray)
            const largestChrom = chromosomes.reduce((prev, current) =>
                current.size > prev.size ? current : prev
            );
            settings.selected_chromosome = largestChrom;
        }
        if (isNullOrUndefined(settings.zoom_level)) {
            settings.zoom_level = TersectBrowserComponent.DEFAULT_ZOOM_LEVEL;
        }
        if (isNullOrUndefined(settings.selected_interval)) {
            settings.selected_interval = [1, settings.selected_chromosome.size];
            console.log('interval settings.selected_interval', settings.selected_interval);
            this.defaultInterval = settings.selected_interval;
        }
        if (isNullOrUndefined(settings.accession_infos)) {
            settings.accession_infos = settings.selected_accessions.map(accId => ({
                id: accId,
                Label: accId
            }));
        }
        if (isNullOrUndefined(settings.plugins)) {
            settings.plugins = [];
        }
    }
}

import { Component, OnInit, ViewChild, HostListener, Input } from '@angular/core';
import { Chromosome } from '../models/chromosome';
import { ScaleBarComponent } from './scale-bar/scale-bar.component';
import { IntrogressionPlotService } from '../services/introgression-plot.service';
import { AccessionBarComponent } from './accession-bar/accession-bar.component';
import { BinPlotComponent } from './bin-plot/bin-plot.component';

@Component({
    selector: 'app-introgression-plot',
    templateUrl: './introgression-plot.component.html',
    styleUrls: ['./introgression-plot.component.css'],
    providers: [ IntrogressionPlotService ]
})

export class IntrogressionPlotComponent implements OnInit {
    @ViewChild(BinPlotComponent) binPlot: BinPlotComponent;
    @ViewChild(ScaleBarComponent) scaleBar: ScaleBarComponent;
    @ViewChild(AccessionBarComponent) accessionBar: AccessionBarComponent;

    @Input()
    set chromosome(chromosome: Chromosome) {
        this.plotService.chromosome = chromosome;
    }

    @Input()
    set interval(interval: number[]) {
        this.plotService.interval = interval;
    }

    @Input()
    set reference(reference_accession: string) {
        this.plotService.reference = reference_accession;
    }

    @Input()
    set binsize(binsize: number) {
        this.plotService.binsize = binsize;
    }

    @Input()
    set accessions(accessions: string[]) {
        this.plotService.accessions = accessions;
    }

    @Input()
    set drawTree(draw_tree: boolean) {
        this.plotService.draw_tree = draw_tree;
    }

    /**
     * Zoom level in percentages.
     */
    @Input()
    set zoom_level(zoom_level: number) {
        this.plotService.zoom_level = zoom_level;
    }

    ngOnInit() {
        this.plotService.plot_position_source.subscribe(() => {
            this.redrawPlot();
        });

        this.plotService.plot_array_source.subscribe(() => {
            this.redrawPlot();
        });

        this.plotService.zoom_level_source.subscribe(() => {
            this.redrawPlot();
        });

        this.plotService.draw_tree_source.subscribe(() => {
            this.redrawPlot();
        });
    }

    redrawPlot() {
        this.accessionBar.draw();
        this.binPlot.draw();
        this.scaleBar.draw();
    }

    constructor(private plotService: IntrogressionPlotService) { }

    @HostListener('window:orientationchange', ['$event'])
    @HostListener('window:resize', ['$event'])
    onResize(event) {
        this.redrawPlot();
    }

}

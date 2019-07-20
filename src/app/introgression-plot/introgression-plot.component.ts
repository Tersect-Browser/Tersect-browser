import { Component, OnInit, ViewChild, HostListener, Input, Output, EventEmitter } from '@angular/core';
import { Chromosome } from '../models/Chromosome';
import { ScaleBarComponent } from './scale-bar/scale-bar.component';
import { IntrogressionPlotService, AccessionDisplayStyle } from './services/introgression-plot.service';
import { AccessionBarComponent } from './accession-bar/accession-bar.component';
import { BinPlotComponent } from './bin-plot/bin-plot.component';
import { PlotMouseClickEvent, PlotMouseHoverEvent, PlotMouseMoveEvent } from '../models/PlotPosition';
import { AccessionDictionary } from '../introgression-browser/browser-settings';
import { isNullOrUndefined } from 'util';

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

    @Output() plotMouseClick = new EventEmitter<PlotMouseClickEvent>();
    @Output() plotMouseHover = new EventEmitter<PlotMouseHoverEvent>();
    @Output() plotMouseMove = new EventEmitter<PlotMouseMoveEvent>();

    @Input()
    set dataset_id(dataset_id: string) {
        this.plotService.dataset_id = dataset_id;
    }

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
    set accessionDisplayStyle(accessionDisplayStyle: AccessionDisplayStyle) {
        if (accessionDisplayStyle !== this.plotService.accession_display) {
            this.plotService.accession_display = accessionDisplayStyle;
            this.redrawPlot();
        }
    }

    @Input()
    set accession_dictionary(accession_dictionary: AccessionDictionary) {
        if (isNullOrUndefined(this.plotService.accession_dictionary)) {
            // No need to redraw anything for the initial dictionary
            this.plotService.accession_dictionary = accession_dictionary;
        } else {
            this.plotService.accession_dictionary = accession_dictionary;
            this.redrawPlot();
        }
    }

    /**
     * Zoom level in percentages.
     */
    @Input()
    set zoom_level(zoom_level: number) {
        if (zoom_level !== this.plotService.zoom_level) {
            this.plotService.zoom_level = zoom_level;
            this.redrawPlot();
        }
    }

    get error_message() {
        return this.plotService.error_message;
    }

    get plot_loading() {
        return this.plotService.plot_loading;
    }

    ngOnInit() {
        this.plotService.plot_position_source.subscribe(() => {
            this.redrawPlot();
        });

        this.plotService.plot_array_source.subscribe(() => {
            this.redrawPlot();
        });

        this.plotService.highlight_source.subscribe(() => {
            this.binPlot.draw();
        });
    }

    private redrawPlot() {
        this.accessionBar.draw();
        this.scaleBar.draw();
        this.binPlot.draw();
    }

    onClick($event: PlotMouseClickEvent) {
        this.plotMouseClick.emit($event);
    }

    onHover($event: PlotMouseHoverEvent) {
        this.plotMouseHover.emit($event);
    }

    onMove($event: PlotMouseMoveEvent) {
        this.plotMouseMove.emit($event);
    }

    constructor(private plotService: IntrogressionPlotService) { }

    @HostListener('window:orientationchange', ['$event'])
    @HostListener('window:resize', ['$event'])
    onResize(event) {
        this.redrawPlot();
    }

}

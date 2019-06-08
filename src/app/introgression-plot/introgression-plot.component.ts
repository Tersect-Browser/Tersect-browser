import { Component, OnInit, ViewChild, HostListener, Input, Output, EventEmitter } from '@angular/core';
import { Chromosome } from '../models/chromosome';
import { ScaleBarComponent } from './scale-bar/scale-bar.component';
import { IntrogressionPlotService } from '../services/introgression-plot.service';
import { AccessionBarComponent } from './accession-bar/accession-bar.component';
import { BinPlotComponent } from './bin-plot/bin-plot.component';
import { PlotMouseClickEvent, PlotMouseHoverEvent, PlotMouseMoveEvent } from '../models/PlotPosition';
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
        if (draw_tree !== this.plotService.draw_tree) {
            this.plotService.draw_tree = draw_tree;
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
            this.redrawPlot();
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
        if ((!isNullOrUndefined($event)
             && $event.buttons !== 1) || isNullOrUndefined($event)) {
            // Clear highlight if mouse button is not held down.
            this.plotService.highlight = undefined;
        }
        this.plotMouseMove.emit($event);
    }

    constructor(private plotService: IntrogressionPlotService) { }

    @HostListener('window:orientationchange', ['$event'])
    @HostListener('window:resize', ['$event'])
    onResize(event) {
        this.redrawPlot();
    }

}

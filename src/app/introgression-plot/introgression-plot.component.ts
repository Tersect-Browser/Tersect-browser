import { ScaleBarComponent } from './scale-bar/scale-bar.component';
import { AccessionBarComponent } from './accession-bar/accession-bar.component';
import { BinPlotComponent } from './bin-plot/bin-plot.component';
import { PlotMouseClickEvent, PlotMouseHoverEvent, PlotMouseMoveEvent } from '../models/PlotPosition';
import { IntrogressionPlotService } from './services/introgression-plot.service';
import { PlotStateService } from './services/plot-state.service';

import { Component, OnInit, ViewChild, HostListener, Output, EventEmitter, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs/Subscription';

@Component({
    selector: 'app-introgression-plot',
    templateUrl: './introgression-plot.component.html',
    styleUrls: ['./introgression-plot.component.css'],
    providers: [ IntrogressionPlotService ]
})

export class IntrogressionPlotComponent implements OnInit, OnDestroy {
    @ViewChild(BinPlotComponent) binPlot: BinPlotComponent;
    @ViewChild(ScaleBarComponent) scaleBar: ScaleBarComponent;
    @ViewChild(AccessionBarComponent) accessionBar: AccessionBarComponent;

    @Output() plotMouseClick = new EventEmitter<PlotMouseClickEvent>();
    @Output() plotMouseHover = new EventEmitter<PlotMouseHoverEvent>();
    @Output() plotMouseMove = new EventEmitter<PlotMouseMoveEvent>();

    private accession_sub: Subscription;
    private zoom_level_sub: Subscription;
    private plot_position_sub: Subscription;
    private plot_array_sub: Subscription;
    private highlight_sub: Subscription;

    get error_message() {
        return this.plotService.error_message;
    }

    get plot_load_message() {
        return this.plotService.plot_load_message;
    }

    ngOnInit() {
        this.accession_sub = this.plotState.accession_style$.subscribe(() => {
            this.redrawPlot();
        });

        this.zoom_level_sub = this.plotState.zoom_level$.subscribe(() => {
            this.redrawPlot();
        });

        this.plot_position_sub = this.plotService.plot_position_source
                                                 .subscribe(() => {
            this.redrawPlot();
        });

        this.plot_array_sub = this.plotService.plot_array_source
                                              .subscribe(() => {
            this.redrawPlot();
        });

        this.highlight_sub = this.plotService.highlight_source.subscribe(() => {
            this.binPlot.draw();
        });
    }

    ngOnDestroy() {
        this.accession_sub.unsubscribe();
        this.zoom_level_sub.unsubscribe();
        this.plot_position_sub.unsubscribe();
        this.plot_array_sub.unsubscribe();
        this.highlight_sub.unsubscribe();
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

    constructor(private plotState: PlotStateService,
                private plotService: IntrogressionPlotService) { }

    @HostListener('window:orientationchange', ['$event'])
    @HostListener('window:resize', ['$event'])
    onResize(event) {
        this.redrawPlot();
    }

}

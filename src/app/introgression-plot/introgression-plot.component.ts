import { ScaleBarComponent } from './scale-bar/scale-bar.component';
import { AccessionBarComponent } from './accession-bar/accession-bar.component';
import { BinPlotComponent } from './bin-plot/bin-plot.component';
import { PlotMouseClickEvent, PlotMouseHoverEvent, PlotMouseMoveEvent } from '../models/PlotPosition';
import { IntrogressionPlotService } from './services/introgression-plot.service';
import { PlotStateService } from './services/plot-state.service';

import { Component, OnInit, ViewChild, HostListener, Output, EventEmitter, OnDestroy } from '@angular/core';
import { Subscription ,  combineLatest } from 'rxjs';

@Component({
    selector: 'app-introgression-plot',
    templateUrl: './introgression-plot.component.html',
    styleUrls: ['./introgression-plot.component.css'],
    providers: [ IntrogressionPlotService ]
})

export class IntrogressionPlotComponent implements OnInit, OnDestroy {
    @ViewChild(BinPlotComponent, { static: true })
    binPlot: BinPlotComponent;

    @ViewChild(ScaleBarComponent, { static: true })
    scaleBar: ScaleBarComponent;

    @ViewChild(AccessionBarComponent, { static: true })
    accessionBar: AccessionBarComponent;

    @Output() plotMouseClick = new EventEmitter<PlotMouseClickEvent>();
    @Output() plotMouseHover = new EventEmitter<PlotMouseHoverEvent>();
    @Output() plotMouseMove = new EventEmitter<PlotMouseMoveEvent>();

    private fullRedraw: Subscription;
    private binRedraw: Subscription;

    get errorMessage() {
        return this.plotService.errorMessage;
    }

    get plotLoadMessage() {
        return this.plotService.plotLoadMessage;
    }

    ngOnInit() {
        this.fullRedraw = combineLatest([
            this.plotState.accessionStyle$,
            this.plotState.zoomLevel$,
            this.plotState.accessionDictionary$,
            this.plotService.plotPositionSource,
            this.plotService.plotArraySource
        ]).subscribe(() => {
            this.redrawPlot();
        });

        this.binRedraw = this.plotService.highlightSource.subscribe(() => {
            this.binPlot.draw();
        });
    }

    ngOnDestroy() {
        this.fullRedraw.unsubscribe();
        this.binRedraw.unsubscribe();
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

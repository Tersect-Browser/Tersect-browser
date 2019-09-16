import {
    Component,
    EventEmitter,
    HostListener,
    OnDestroy,
    OnInit,
    Output,
    ViewChild
} from '@angular/core';

import { combineLatest, Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';

import {
    PlotMouseClickEvent,
    PlotMouseHoverEvent,
    PlotMouseMoveEvent
} from '../models/Plot';
import {
    isNullOrUndefined
} from '../utils/utils';
import {
    AccessionBarComponent
} from './accession-bar/accession-bar.component';
import {
    BinPlotComponent
} from './bin-plot/bin-plot.component';
import {
    ScaleBarComponent
} from './scale-bar/scale-bar.component';
import {
    IntrogressionPlotService
} from './services/introgression-plot.service';
import {
    PlotStateService
} from './services/plot-state.service';

export interface ContainerSize {
    height: number;
    width: number;
}

@Component({
    selector: 'app-introgression-plot',
    templateUrl: './introgression-plot.component.html',
    styleUrls: ['./introgression-plot.component.css'],
    providers: [ IntrogressionPlotService ]
})
export class IntrogressionPlotComponent implements OnInit, OnDestroy {
    @ViewChild(BinPlotComponent, { static: true })
    readonly binPlot: BinPlotComponent;

    @ViewChild(ScaleBarComponent, { static: true })
    readonly scaleBar: ScaleBarComponent;

    @ViewChild(AccessionBarComponent, { static: true })
    readonly accessionBar: AccessionBarComponent;

    @Output() plotMouseClick = new EventEmitter<PlotMouseClickEvent>();
    @Output() plotMouseHover = new EventEmitter<PlotMouseHoverEvent>();
    @Output() plotMouseMove = new EventEmitter<PlotMouseMoveEvent>();

    private fullRedraw: Subscription;

    constructor(private readonly plotState: PlotStateService,
                private readonly plotService: IntrogressionPlotService) { }

    get plotLoadMessage() {
        return this.plotService.plotLoadMessage;
    }

    ngOnInit() {
        this.fullRedraw = combineLatest([
            this.plotState.accessionStyle$,
            this.plotState.zoomLevel$,
            this.plotState.accessionDictionary$,
            this.plotService.plotPositionSource,
            this.plotService.plotImageArraySource
        ]).pipe(
            filter(triggerVars => !triggerVars.some(isNullOrUndefined))
        ).subscribe(() => {
            this.redrawPlot();
        });
    }

    ngOnDestroy() {
        this.fullRedraw.unsubscribe();
    }

    getErrors(): string {
        return Array.from(this.plotService.errorMessages).join('\n');
    }

    hasErrors(): boolean {
        return this.plotService.errorMessages.size > 0;
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

    private redrawPlot() {
        this.accessionBar.draw();
        this.scaleBar.draw();
        this.binPlot.draw();
    }

    @HostListener('window:orientationchange', ['$event'])
    @HostListener('window:resize', ['$event'])
    onResize($event: Event) {
        this.redrawPlot();
    }
}

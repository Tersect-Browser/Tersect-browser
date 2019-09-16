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
    BinPlotComponent
} from './bin-plot/bin-plot.component';
import {
    ScaleBarComponent
} from './scale-bar/scale-bar.component';
import {
    PlotCreatorService
} from './services/plot-creator.service';
import {
    PlotStateService
} from './services/plot-state.service';
import {
    TreePlotComponent
} from './tree-plot/tree-plot.component';

export interface ContainerSize {
    height: number;
    width: number;
}

@Component({
    selector: 'app-introgression-plot',
    templateUrl: './introgression-plot.component.html',
    styleUrls: ['./introgression-plot.component.css'],
    providers: [ PlotCreatorService ]
})
export class IntrogressionPlotComponent implements OnInit, OnDestroy {
    @ViewChild(BinPlotComponent, { static: true })
    readonly binPlot: BinPlotComponent;

    @ViewChild(ScaleBarComponent, { static: true })
    readonly scaleBar: ScaleBarComponent;

    @ViewChild(TreePlotComponent, { static: true })
    readonly treePlot: TreePlotComponent;

    @Output() plotMouseClick = new EventEmitter<PlotMouseClickEvent>();
    @Output() plotMouseHover = new EventEmitter<PlotMouseHoverEvent>();
    @Output() plotMouseMove = new EventEmitter<PlotMouseMoveEvent>();

    private fullRedraw: Subscription;

    constructor(private readonly plotState: PlotStateService,
                private readonly plotCreator: PlotCreatorService) { }

    get plotLoadMessage() {
        return this.plotCreator.plotLoadMessage;
    }

    ngOnInit() {
        this.fullRedraw = combineLatest([
            this.plotState.accessionStyle$,
            this.plotState.zoomLevel$,
            this.plotState.accessionDictionary$,
            this.plotState.plotPositionSource,
            this.plotCreator.distanceBinsSource
        ]).pipe(
            filter(triggerVars => !triggerVars.some(isNullOrUndefined))
        ).subscribe(() => {
            this.redrawPlot();
            this.plotCreator.stopLoading();
        });
    }

    ngOnDestroy() {
        this.fullRedraw.unsubscribe();
    }

    getErrors(): string {
        return Array.from(this.plotCreator.errorMessages).join('\n');
    }

    hasErrors(): boolean {
        return this.plotCreator.errorMessages.size > 0;
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
        this.treePlot.draw();
        this.scaleBar.draw();
        this.binPlot.draw();
    }

    @HostListener('window:orientationchange', ['$event'])
    @HostListener('window:resize', ['$event'])
    onResize($event: Event) {
        this.redrawPlot();
    }
}

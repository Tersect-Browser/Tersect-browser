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
} from '../../models/Plot';
import {
    isNullOrUndefined
} from '../../utils/utils';
import {
    BinPlotComponent
} from './components/bin-plot/bin-plot.component';
import {
    ScaleBarComponent
} from './components/scale-bar/scale-bar.component';
import {
    TreePlotComponent
} from './components/tree-plot/tree-plot.component';
import {
    PlotCreatorService
} from './services/plot-creator.service';
import {
    PlotStateService
} from './services/plot-state.service';

export interface ContainerSize {
    height: number;
    width: number;
}

@Component({
    selector: 'app-tersect-distance-plot',
    templateUrl: './tersect-distance-plot.component.html',
    styleUrls: ['./tersect-distance-plot.component.css'],
    providers: [
        PlotCreatorService
    ]
})
export class TersectDistancePlotComponent implements OnInit, OnDestroy {
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
            this.plotState.plotPosition$,
            this.plotState.distanceBins$
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

    isLoading(): boolean {
        return this.plotCreator.isLoading();
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

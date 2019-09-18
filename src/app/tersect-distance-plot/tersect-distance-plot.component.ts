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
import { BinDrawService } from './services/bin-draw.service';
import {
    ExportPlotService
} from './services/export-plot.service';
import {
    PlotCreatorService
} from './services/plot-creator.service';
import {
    PlotStateService
} from './services/plot-state.service';
import {
    ScaleDrawService
} from './services/scale-draw.service';
import {
    TreeDrawService
} from './services/tree-draw.service';
import {
    TreePlotComponent
} from './tree-plot/tree-plot.component';

export interface ContainerSize {
    height: number;
    width: number;
}

@Component({
    selector: 'app-tersect-distance-plot',
    templateUrl: './tersect-distance-plot.component.html',
    styleUrls: ['./tersect-distance-plot.component.css'],
    providers: [
        PlotCreatorService,
        BinDrawService,
        ScaleDrawService,
        TreeDrawService,
        ExportPlotService
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
                private readonly plotCreator: PlotCreatorService,
                private readonly plotExporter: ExportPlotService) { }

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

    getPlotImage(): Promise<Blob> {
        return this.plotExporter.exportImage();
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

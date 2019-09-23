import { Injectable } from '@angular/core';

import { ContainerSize } from '../components/tersect-distance-plot.component';
import { AccessionTreeView } from '../models/AccessionTreeView';
import { DistanceBinView } from '../models/DistanceBinView';
import { BinDrawService } from './bin-draw.service';
import { PlotCreatorService } from './plot-creator.service';
import { PlotStateService } from './plot-state.service';
import { ScaleDrawService } from './scale-draw.service';
import { TreeDrawService } from './tree-draw.service';

@Injectable()
export class ExportPlotService {
    constructor(private readonly plotState: PlotStateService,
                private readonly plotCreator: PlotCreatorService,
                private readonly binDraw: BinDrawService,
                private readonly scaleDraw: ScaleDrawService,
                private readonly treeDraw: TreeDrawService) { }

    exportImage(): Promise<Blob> {
        const binView = new DistanceBinView(this.plotCreator.distanceBins,
                                            this.plotState.orderedAccessions,
                                            this.plotCreator.binHeight);
        binView.sequenceGaps = this.plotCreator.sequenceGaps;
        this.binDraw.drawBins(binView);

        const containerSize: ContainerSize = {
            height: binView.rowNum * this.plotCreator.binHeight,
            width: binView.colNum * this.plotCreator.binWidth
        };

        const treeView = new AccessionTreeView(this.plotCreator.pheneticTree,
                                               this.plotCreator.binHeight,
                                               containerSize);
        this.treeDraw.drawTree(treeView, 0, 0, containerSize);

        const fullCanvas = document.createElement('canvas');
        const fullCtx: CanvasRenderingContext2D = fullCanvas.getContext('2d');
        fullCanvas.width = containerSize.width;
        fullCanvas.height = containerSize.height;

        fullCtx.putImageData(treeView.getImageData(), 0, 0);
        fullCtx.putImageData(binView.getImageData(),
                             treeView.offscreenCanvas.width, 0);

        return new Promise(resolve => {
            fullCanvas.toBlob(blob => {
                resolve(blob);
            });
        });
    }
}

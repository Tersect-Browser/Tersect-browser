import { Injectable } from '@angular/core';

import { AccessionTreeView } from '../models/AccessionTreeView';
import { DistanceBinView } from '../models/DistanceBinView';
import { ContainerSize } from '../tersect-distance-plot.component';
import { BinDrawService } from './bin-draw.service';
import { PlotStateService } from './plot-state.service';
import { ScaleDrawService } from './scale-draw.service';
import { TreeDrawService } from './tree-draw.service';

@Injectable()
export class ExportPlotService {
    constructor(private readonly plotState: PlotStateService,
                private readonly binDraw: BinDrawService,
                private readonly scaleDraw: ScaleDrawService,
                private readonly treeDraw: TreeDrawService) { }

    exportImage(): Promise<Blob> {
        const binHeight = 10;
        const binWidth = binHeight * DistanceBinView.DEFAULT_ASPECT_RATIO;

        const binView = new DistanceBinView(this.plotState.distanceBins,
                                            this.plotState.orderedAccessions,
                                            binHeight);
        binView.sequenceGaps = this.plotState.sequenceGaps;
        this.binDraw.drawBins(binView);

        const containerSize: ContainerSize = {
            height: binView.rowNum * binHeight,
            width: binView.colNum * binWidth
        };

        const treeView = new AccessionTreeView(this.plotState.pheneticTree,
                                               binHeight,
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

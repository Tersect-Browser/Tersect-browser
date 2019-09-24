import { Injectable } from '@angular/core';

import {
    PlotStateService
} from '../../../components/tersect-distance-plot/services/plot-state.service';
import {
    ContainerSize
} from '../../../components/tersect-distance-plot/tersect-distance-plot.component';
import {
    AccessionTreeView
} from '../../../models/AccessionTreeView';
import {
    DistanceBinView
} from '../../../models/DistanceBinView';
import {
    BinDrawService
} from '../../../services/bin-draw.service';
import {
    ScaleDrawService
} from '../../../services/scale-draw.service';
import {
    TreeDrawService
} from '../../../services/tree-draw.service';

@Injectable()
export class ExportPlotService {
    constructor(private readonly plotState: PlotStateService,
                private readonly binDraw: BinDrawService,
                private readonly scaleDraw: ScaleDrawService,
                private readonly treeDraw: TreeDrawService) { }

    getPlotSize(binHeight: number) {
        const binWidth = binHeight * DistanceBinView.DEFAULT_ASPECT_RATIO;
        const containerSize: ContainerSize = {
            height: binView.rowNum * binHeight,
            width: binView.colNum * binWidth
        };
        return
    }

    exportImage(binView: DistanceBinView,
                treeView: AccessionTreeView): Promise<Blob> {
        const binHeight = 10;
        const binWidth = binHeight * DistanceBinView.DEFAULT_ASPECT_RATIO;

        binView.sequenceGaps = this.plotState.sequenceGaps;
        this.binDraw.drawBins(binView);

        const containerSize: ContainerSize = {
            height: binView.rowNum * binHeight,
            width: binView.colNum * binWidth
        };
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

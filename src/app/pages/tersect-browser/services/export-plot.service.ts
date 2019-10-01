import { Injectable } from '@angular/core';

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
    ScaleView
} from '../../../models/ScaleView';
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
    constructor(private readonly binDraw: BinDrawService,
                private readonly scaleDraw: ScaleDrawService,
                private readonly treeDraw: TreeDrawService) { }

    exportImage(binView: DistanceBinView,
                treeView: AccessionTreeView,
                scaleView: ScaleView): Promise<Blob> {
        return new Promise(resolve => {
            const binSize = this.binDraw.getImageSize(binView);
            const treeSize = this.treeDraw.getImageSize(treeView);
            const scaleSize = this.scaleDraw.getImageSize(scaleView);

            const fullCanvas = document.createElement('canvas');
            const fullCtx: CanvasRenderingContext2D = fullCanvas.getContext('2d');

            fullCanvas.width = binSize.width + treeSize.width;
            fullCanvas.height = binSize.height + scaleSize.height;

            fullCtx.putImageData(this.treeDraw.getImageData(treeView),
                                 0, scaleSize.height);
            fullCtx.putImageData(this.binDraw.getImageData(binView),
                                 treeSize.width, scaleSize.height);
            fullCtx.putImageData(this.scaleDraw.getImageData(scaleView),
                                 treeSize.width, 0);
            fullCanvas.toBlob(blob => {
                resolve(blob);
            });
        });
    }

    getLabelWidth(treeView: AccessionTreeView): number {
        return this.treeDraw.getImageSize(treeView).width;
    }

    getTotalSize(binView: DistanceBinView,
                 treeView: AccessionTreeView,
                 scaleView: ScaleView): ContainerSize {
        const binSize = this.binDraw.getImageSize(binView);
        const treeSize = this.treeDraw.getImageSize(treeView);
        const scaleSize = this.scaleDraw.getImageSize(scaleView);
        return {
            width: binSize.width + treeSize.width,
            height: binSize.height + scaleSize.height
        };
    }
}

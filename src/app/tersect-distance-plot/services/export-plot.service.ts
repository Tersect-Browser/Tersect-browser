import { Injectable } from '@angular/core';

import { AccessionTreeView } from '../models/AccessionTreeView';
import { ContainerSize } from '../tersect-distance-plot.component';
import { BinDrawService } from './bin-draw.service';
import { PlotCreatorService } from './plot-creator.service';
import { ScaleDrawService } from './scale-draw.service';
import { TreeDrawService } from './tree-draw.service';

@Injectable()
export class ExportPlotService {
    constructor(private readonly plotCreator: PlotCreatorService,
                private readonly binDraw: BinDrawService,
                private readonly scaleDraw: ScaleDrawService,
                private readonly treeDraw: TreeDrawService) { }

    exportImage(): Promise<Blob> {
        const containerSize: ContainerSize = {
            height: this.plotCreator.rowNum * this.plotCreator.binHeight,
            width: this.plotCreator.colNum * this.plotCreator.binWidth
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
        fullCtx.putImageData(this.binDraw.getImageData(),
                             treeView.offscreenCanvas.width, 0);

        return new Promise(resolve => {
            fullCanvas.toBlob(blob => {
                resolve(blob);
            });
        });
    }
}

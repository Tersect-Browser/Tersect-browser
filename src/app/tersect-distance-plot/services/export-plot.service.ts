import { Injectable } from '@angular/core';

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
        const tempCanvas = document.createElement('canvas');
        const ctx: CanvasRenderingContext2D = tempCanvas.getContext('2d');
        tempCanvas.width = this.plotCreator.colNum * this.plotCreator.binWidth;
        tempCanvas.height = this.plotCreator.rowNum * this.plotCreator.binHeight;
        ctx.putImageData(this.binDraw.getImageData(), 0, 0);
        return new Promise(resolve => {
            tempCanvas.toBlob(blob => {
                resolve(blob);
            });
        });
    }
}

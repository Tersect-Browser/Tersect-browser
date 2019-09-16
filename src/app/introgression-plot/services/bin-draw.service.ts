import { Injectable } from '@angular/core';

import { ContainerSize } from '../introgression-plot.component';
import { PlotCreatorService } from './plot-creator.service';
import { PlotStateService } from './plot-state.service';

@Injectable()
export class BinDrawService {
    constructor(private readonly plotState: PlotStateService,
                private readonly plotCreator: PlotCreatorService) { }

    drawBins(targetCanvas: HTMLCanvasElement,
             containerSize: ContainerSize) {
        this.updateCanvas(targetCanvas, containerSize);

        const ctx: CanvasRenderingContext2D = targetCanvas.getContext('2d');
        ctx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
        ctx.putImageData(this.extractVisibleImage(targetCanvas),
                         this.plotCreator.guiMargins.left, 0);
    }

    private extractVisibleImage(targetCanvas: HTMLCanvasElement): ImageData {
        const fullArray = this.plotCreator.plotImageArray;
        const pos = this.plotCreator.plotPosition;
        const colNum = this.plotCreator.colNum;

        let visibleCols = Math.ceil(targetCanvas.width
                                    / this.plotCreator.binWidth)
                          - this.plotCreator.guiMargins.left;
        if (visibleCols > colNum + pos.x) {
            // More visible area than available columns
            visibleCols = colNum + pos.x;
            if (visibleCols < 1) {
                visibleCols = 1;
            }
        }

        const visibleRows = Math.ceil(targetCanvas.height
                                      / this.plotCreator.binHeight);

        const visibleArray = new Uint8ClampedArray(4 * visibleRows
                                                   * visibleCols);

        for (let i = 0; i < visibleRows; i++) {
            const rowStart = 4 * (colNum * (i - pos.y) - pos.x);
            visibleArray.set(fullArray.slice(rowStart,
                                             rowStart + 4 * visibleCols),
                             4 * i * visibleCols);
        }
        return new ImageData(visibleArray, visibleCols, visibleRows);
    }

    private updateCanvas(targetCanvas: HTMLCanvasElement,
                         containerSize: ContainerSize) {
        targetCanvas.style.width = `${this.plotState.zoomLevel}%`;
        targetCanvas.style.height = `${this.plotState.zoomLevel
                                       / this.plotCreator.aspectRatio}%`;
        targetCanvas.width = containerSize.width;
        targetCanvas.height = containerSize.height;
    }
}

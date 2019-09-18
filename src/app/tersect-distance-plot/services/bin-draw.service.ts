import { Injectable } from '@angular/core';

import * as deepEqual from 'fast-deep-equal';

import { DistanceBinQuery } from '../../models/DistanceBins';
import { SequenceInterval } from '../../models/SequenceInterval';
import { ceilTo, deepCopy, floorTo } from '../../utils/utils';
import { GreyscalePalette } from '../DistancePalette';
import { ContainerSize } from '../tersect-distance-plot.component';
import { PlotCreatorService } from './plot-creator.service';
import { PlotStateService } from './plot-state.service';

@Injectable()
export class BinDrawService {
    private imageArray: Uint8ClampedArray;
    private storedDistanceBinQuery: DistanceBinQuery;

    constructor(private readonly plotState: PlotStateService,
                private readonly plotCreator: PlotCreatorService) { }

    drawBins(targetCanvas: HTMLCanvasElement,
             containerSize: ContainerSize) {
        this.updateCanvas(targetCanvas, containerSize);

        if (!deepEqual(this.plotCreator.distanceBins.query,
                       this.storedDistanceBinQuery)) {
            // Updated distance bins
            this.imageArray = this.generatePlotArray();
            this.storedDistanceBinQuery = deepCopy(this.plotCreator
                                                       .distanceBins.query);
        }

        const ctx: CanvasRenderingContext2D = targetCanvas.getContext('2d');
        ctx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
        ctx.putImageData(this.extractVisibleImage(targetCanvas, this.imageArray),
                         this.plotCreator.guiMargins.left, 0);
    }

    getImageData(): ImageData {
        return new ImageData(this.imageArray, this.plotCreator.colNum,
                             this.plotCreator.rowNum);
    }

    private addPlotGap(plotArray: Uint8ClampedArray, gap: SequenceInterval) {
        const rowNum = this.plotCreator.rowNum;
        const colNum = this.plotCreator.colNum;
        const interval = this.plotState.interval;
        const startPos = gap.start > interval[0] ? gap.start : interval[0];
        const endPos = gap.end < interval[1] ? gap.end : interval[1];
        const binStart = ceilTo(startPos - interval[0], this.plotState.binsize)
                         / this.plotState.binsize;
        // NOTE: binEnd index is exclusive while gap.end position is inclusive
        const binEnd = floorTo(endPos - interval[0] + 1, this.plotState.binsize)
                       / this.plotState.binsize;
        for (let accessionIndex = 0;
                 accessionIndex < rowNum;
                 accessionIndex++) {
            for (let binIndex = binStart; binIndex < binEnd; binIndex++) {
                const pos = 4 * (binIndex + colNum * accessionIndex);
                plotArray[pos] = PlotCreatorService.GAP_COLOR[0];
                plotArray[pos + 1] = PlotCreatorService.GAP_COLOR[1];
                plotArray[pos + 2] = PlotCreatorService.GAP_COLOR[2];
                plotArray[pos + 3] = PlotCreatorService.GAP_COLOR[3];
            }
        }
    }

    /**
     * Add gaps to existing plot array.
     */
    private addPlotGaps(plotArray: Uint8ClampedArray) {
        this.plotCreator.sequenceGaps.forEach(gap => {
            if (gap.size >= this.plotState.binsize) {
                this.addPlotGap(plotArray, gap);
            }
        });
    }

    private extractVisibleImage(targetCanvas: HTMLCanvasElement,
                                imageArray: Uint8ClampedArray): ImageData {
        const pos = this.plotState.plotPosition;
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
            visibleArray.set(imageArray.slice(rowStart,
                                              rowStart + 4 * visibleCols),
                             4 * i * visibleCols);
        }
        return new ImageData(visibleArray, visibleCols, visibleRows);
    }

    private generatePlotArray(): Uint8ClampedArray {
        const palette = new GreyscalePalette();
        const accessionBins = this.plotState.orderedAccessions.map(
            accession => this.plotCreator.distanceBins.bins[accession]
        );

        const binMaxDistances = this.getMaxDistances(accessionBins);

        const rowNum = this.plotCreator.rowNum;
        const colNum = this.plotCreator.colNum;
        const plotArray = new Uint8ClampedArray(4 * rowNum * colNum);

        accessionBins.forEach((accessionBin, accessionIndex) => {
            palette.distanceToColors(accessionBin, binMaxDistances)
                   .forEach((color, binIndex) => {
                const pos = 4 * (binIndex + colNum * accessionIndex);
                plotArray[pos] = color.data[0];
                plotArray[pos + 1] = color.data[1];
                plotArray[pos + 2] = color.data[2];
                plotArray[pos + 3] = color.data[3];
            });
        });

        this.addPlotGaps(plotArray);
        return plotArray;
    }

    /**
     * Get an array of maximum distances per bin for a given set of accessions.
     */
    private getMaxDistances(accessionBins: number[][]): number[] {
        const binMaxDistances = new Array(accessionBins[0].length).fill(0);
        accessionBins.forEach(accBin => {
            accBin.forEach((dist, i) => {
                if (dist > binMaxDistances[i]) {
                    binMaxDistances[i] = dist;
                }
            });
        });
        return binMaxDistances;
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

import { Injectable } from '@angular/core';

import {
    DistancePalette, GreyscalePalette
} from '../components/tersect-distance-plot/DistancePalette';
import {
    PlotCreatorService
} from '../components/tersect-distance-plot/services/plot-creator.service';
import {
    ContainerSize
} from '../components/tersect-distance-plot/tersect-distance-plot.component';
import {
    DistanceBinView
} from '../models/DistanceBinView';
import {
    SequenceInterval
} from '../models/SequenceInterval';
import {
    ceilTo,
    floorTo,
    isNullOrUndefined
} from '../utils/utils';
import testHighImpactAccessions from '../pages/tersect-browser/testHighImpactAccessions';
import { findAccessionMatch, getBinIndexFromPosition } from './accessionUtils';

@Injectable({
    providedIn: 'root'
})
export class BinDrawService {

    public targetCanvas: HTMLCanvasElement;
    public offsetX: number;
    public offsetY: number;
    public bins: DistanceBinView;
    public accessions: string[];
    public binIndex: number;

      refreshBin(){
            this.generatePlotArray(this.bins);
            if (!isNullOrUndefined(this.targetCanvas)) {
                this.updateCanvas(this.bins, this.targetCanvas);
                const targetCanvas = this.targetCanvas;
                const ctx: CanvasRenderingContext2D = targetCanvas.getContext('2d');
                ctx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
                const visibleImage = this.extractVisibleImage(this.bins,
                                                              this.offsetX, this.offsetY,
                                                              targetCanvas);
                ctx.putImageData(visibleImage, this.offsetX, this.offsetY);
            }
        
        }


    draw(binView: DistanceBinView, offsetX?: number, offsetY?: number,
        targetCanvas?: HTMLCanvasElement) {
        if (binView.redrawRequired) {
            this.bins = binView;
            this.offsetX = offsetX;
            this.offsetY = offsetY;
            this.generatePlotArray(binView);
        }

        if (!isNullOrUndefined(targetCanvas)) {
            this.updateCanvas(binView, targetCanvas);
            this.targetCanvas = targetCanvas;
            const ctx: CanvasRenderingContext2D = targetCanvas.getContext('2d');
            ctx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
            const visibleImage = this.extractVisibleImage(binView,
                offsetX, offsetY,
                targetCanvas);
            ctx.putImageData(visibleImage, offsetX, offsetY);
        }
    }

    getImageData(binView: DistanceBinView): ImageData {
        if (binView.redrawRequired) {
            this.generatePlotArray(binView);
        }
        const offscreenCanvas = document.createElement('canvas');
        offscreenCanvas.width = binView.colNum * binView.binWidth;
        offscreenCanvas.height = binView.rowNum * binView.binHeight;
        const ctx: CanvasRenderingContext2D = offscreenCanvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.putImageData(new ImageData(binView.imageArray, binView.colNum,
            binView.rowNum), 0, 0);
        ctx.scale(binView.binWidth, binView.binHeight);
        ctx.drawImage(offscreenCanvas, 0, 0);
        return ctx.getImageData(0, 0, offscreenCanvas.width,
            offscreenCanvas.height);
    }

    getImageSize(binView: DistanceBinView): ContainerSize {
        return {
            width: Math.ceil(binView.colNum * binView.binWidth),
            height: Math.ceil(binView.rowNum * binView.binHeight)
        };
    }

    private addPlotGap(binView: DistanceBinView, gap: SequenceInterval) {
        const rowNum = binView.rowNum;
        const colNum = binView.colNum;
        const interval = binView.interval;
        const startPos = gap.start > interval[0] ? gap.start : interval[0];
        const endPos = gap.end < interval[1] ? gap.end : interval[1];
        const binStart = ceilTo(startPos - interval[0], binView.binsize)
            / binView.binsize;
        // NOTE: binEnd index is exclusive while gap.end position is inclusive
        const binEnd = floorTo(endPos - interval[0] + 1, binView.binsize)
            / binView.binsize;
        for (let accessionIndex = 0;
            accessionIndex < rowNum;
            accessionIndex++) {
            for (let binIndex = binStart; binIndex < binEnd; binIndex++) {
                const pos = 4 * (binIndex + colNum * accessionIndex);
                binView.imageArray[pos] = PlotCreatorService.GAP_COLOR[0];
                binView.imageArray[pos + 1] = PlotCreatorService.GAP_COLOR[1];
                binView.imageArray[pos + 2] = PlotCreatorService.GAP_COLOR[2];
                binView.imageArray[pos + 3] = PlotCreatorService.GAP_COLOR[3];
            }
        }
    }

    /**
     * Add gaps to existing plot array.
     */
    private addPlotGaps(binView: DistanceBinView) {
        binView.sequenceGaps.forEach(gap => {
            if (gap.size >= binView.binsize) {
                this.addPlotGap(binView, gap);
            }
        });
    }

    private extractVisibleImage(binView: DistanceBinView,
        offsetX: number, offsetY: number,
        targetCanvas: HTMLCanvasElement): ImageData {
        if (isNullOrUndefined(offsetX)) {
            offsetX = 0;
        }
        if (isNullOrUndefined(offsetY)) {
            offsetY = 0;
        }

        const pos = binView.plotPosition;
        const colNum = binView.colNum;

        let visibleCols = Math.ceil(targetCanvas.width / binView.binWidth)
            - offsetX;
        if (visibleCols > colNum + pos.x) {
            // More visible area than available columns
            visibleCols = colNum + pos.x;
            if (visibleCols < 1) {
                visibleCols = 1;
            }
        }

        const visibleRows = Math.ceil(targetCanvas.height / binView.binHeight)
            - offsetY;

        const visibleArray = new Uint8ClampedArray(4 * visibleRows
            * visibleCols);

        for (let i = 0; i < visibleRows; i++) {
            const rowStart = 4 * (colNum * (i - pos.y) - pos.x);
            visibleArray.set(binView.imageArray
                .slice(rowStart, rowStart + 4 * visibleCols),
                4 * i * visibleCols);
        }
        return new ImageData(visibleArray, visibleCols, visibleRows);
    }

    private generatePlotArray(binView: DistanceBinView) {
        const palette: DistancePalette = GreyscalePalette;

        // First dimension (rows) are accessions, second (cols) are bins.
        const binMatrix: number[][] = binView.orderedAccessions.map(
            accession => binView.distanceBins.bins[accession]
        );


        

        const binMaxDistances = this.getMaxDistances(binMatrix);

        const rowNum = binView.rowNum;
        const colNum = binView.colNum;
        binView.imageArray = new Uint8ClampedArray(4 * rowNum * colNum);

        for (let row = 0; row < rowNum; row++) {
            const rowOffset = colNum * row;
            for (let col = 0; col < colNum; col++) {
                const color = palette.getDistanceColor(binMatrix[row][col],
                    binMaxDistances[col]);
                const pos = 4 * (col + rowOffset);
                binView.imageArray[pos] = color.data[0];
                binView.imageArray[pos + 1] = color.data[1];
                binView.imageArray[pos + 2] = color.data[2];
                binView.imageArray[pos + 3] = color.data[3];
            }
        }

        if (!isNullOrUndefined(binView.sequenceGaps) &&
            !isNullOrUndefined(binView.interval)) {
            this.addPlotGaps(binView);
        }

        binView.redrawRequired = false;
    }

    /**
     * Get an array of maximum distances per bin for a given set of accessions.
     */
    private getMaxDistances(binMatrix: number[][]): number[] {
        const binMaxDistances = new Array(binMatrix[0].length).fill(0);
        binMatrix.forEach(accBin => {
            accBin.forEach((dist, i) => {
                if (dist > binMaxDistances[i]) {
                    binMaxDistances[i] = dist;
                }
            });
        });
        return binMaxDistances;
    }

    private updateCanvas(binView: DistanceBinView,
        targetCanvas: HTMLCanvasElement) {
        targetCanvas.style.width = `${binView.binWidth * 100}%`;
        targetCanvas.style.height = `${binView.binHeight * 100}%`;
        if (isNullOrUndefined(binView.containerSize)) {
            targetCanvas.width = binView.colNum * binView.binWidth;
            targetCanvas.height = binView.rowNum * binView.binHeight;
        } else {
            targetCanvas.width = binView.containerSize.width;
            targetCanvas.height = binView.containerSize.height;
        }
    }

    // Define function to redraw canvas to highlight feature bins

    getAccessionIndexFromName (accessionName, orderedAccessions) {
        return orderedAccessions.findIndex(each => each === accessionName)
    }

    highlightBins(intervalStart, binsize, orderedAccessions, searchedAccessions) {
        if(searchedAccessions.length < 1){
            this.refreshBin();
            return;
        }
        const binMapSet = new Map();
        searchedAccessions.variants.forEach((highImpact) => {
                const binIndex = getBinIndexFromPosition(highImpact.pos.start, intervalStart, binsize)
                if(binMapSet.has(binIndex)){
                    binMapSet.set(binIndex, [...binMapSet.get(binIndex), ...(highImpact.accessions.map(each => this.getAccessionIndexFromName(each, orderedAccessions)))]);
                }else {
                    binMapSet.set(binIndex, highImpact.accessions.map(each => this.getAccessionIndexFromName(each, orderedAccessions)))
                }
        })
        this.highlightFeatureBins(binMapSet,  this.bins)

        if (!isNullOrUndefined(this.targetCanvas)) {
            this.updateCanvas(this.bins, this.targetCanvas);
            const targetCanvas = this.targetCanvas;
            const ctx: CanvasRenderingContext2D = targetCanvas.getContext('2d');
            ctx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
            const visibleImage = this.extractVisibleImage(this.bins,
                this.offsetX, this.offsetY,
                targetCanvas);
            ctx.putImageData(visibleImage, this.offsetX, this.offsetY);
        }
    }

    // Define setters and getters to get data passed from tersect-browser.component.ts
    setAccessions(value: string[]) {
        this.accessions = value;
    }

    getAccessions() {
        return this.accessions;
    }

    setBinIndex(value: number) {
        this.binIndex = value;
    }

    getBinIndex() {
        return this.binIndex;
    }

    // Define function to highlight feature bins

    highlightFeatureBins(binMapSet: Map<number, number[]>,  binView: DistanceBinView) {
 


        const palette: DistancePalette = GreyscalePalette;
        // const colorPalette: DistancePalette = RedPalette;

        // First dimension (rows) are accessions, second (cols) are bins.
        const binMatrix: number[][] = binView.orderedAccessions.map(
            accession => binView.distanceBins.bins[accession]
        );


        const binMaxDistances = this.getMaxDistances(binMatrix);

        const rowNum = binView.rowNum;
        const colNum = binView.colNum;
        binView.imageArray = new Uint8ClampedArray(4 * rowNum * colNum);

        // Colour canvas in greyscale 

        for (let row = 0; row < rowNum; row++) {
            const rowOffset = colNum * row;
            for (let col = 0; col < colNum; col++) {
                const color = palette.getDistanceColor(binMatrix[row][col],
                    binMaxDistances[col]);
                const pos = 4 * (col + rowOffset);
                binView.imageArray[pos] = color.data[0];
                binView.imageArray[pos + 1] = color.data[1];
                binView.imageArray[pos + 2] = color.data[2];
                binView.imageArray[pos + 3] = color.data[3];
            }
        }

        if (!isNullOrUndefined(binView.sequenceGaps) &&
            !isNullOrUndefined(binView.interval)) {
            this.addPlotGaps(binView);
        }

        // Colour specified bins red
        const coordinates = Array.from(binMapSet);

        // for (let i = 0; i < accessionIndices.length; i++) {
        //     let row = accessionIndices[i]; // set row as the index defined in indices
        //     const rowOffset = colNum * row;
        //     const col = binIndex;
        //     const pos = 4 * (col + rowOffset); // to colour col 1
            
        // }

        coordinates.forEach(([col, rowArray]) => {
            rowArray.forEach(row => {
                const rowOffset = colNum * row;
                const pos = 4 * (col + rowOffset);
                binView.imageArray[pos] = 255;
                binView.imageArray[pos + 1] = 0;
                binView.imageArray[pos + 2] = 0;
                binView.imageArray[pos + 3] = 255;
            })
        })

        binView.redrawRequired = false;
        return binView;
    }
}

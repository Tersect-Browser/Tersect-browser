export abstract class DistancePalette {
    protected readonly palette: ImageData[];

    constructor() {
        this.palette = [];
    }

    abstract getDistanceColor(distance: number, maxDistance: number): ImageData;

    protected _getDistanceColor(palette: ImageData[],
                                distance: number,
                                maxDistance: number): ImageData {
        if (maxDistance === 0) {
            return palette[0];
        }
        const colorIndex = Math.floor(distance / maxDistance
                                      * (palette.length - 1));
        return palette[colorIndex];
    }
}

export class InterpolatedPalette extends DistancePalette {
    constructor(startColor: number[],
                endColor: number[],
                levels = 256) {
        super();
        for (let i = 0; i < levels; i++) {
            const endWeight = i / (levels - 1);

            this.palette[i] = new ImageData(1, 1);
            for (let c = 0; c < 4; c++) {
                this.palette[i].data[c] = Math.round(
                    startColor[c] + (endColor[c] - startColor[c]) * endWeight
                );
            }
        }
    }

    getDistanceColor(distance: number, maxDistance: number): ImageData {
        return this._getDistanceColor(this.palette, distance, maxDistance);
    }
}

export const GreyscalePalette = new InterpolatedPalette([255, 255, 255, 255],
                                                        [0, 0, 0, 255]);

export const RedPalette = new InterpolatedPalette([255, 255, 255, 255],
                                                  [255, 0, 0, 255]);

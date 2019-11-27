export abstract class DistancePalette {
    protected static MAX_DISTANCE = 255;
    /**
     * Create an array of pixels (ImageData objects) corresponding to the
     * provided array of distances. The color scale depends on the specific
     * palette class.
     * @param distances array if numbers representing genetic distance
     * @param maxDistances list of maximum distances per bin, used for scaling
     */
    constructor() {}
    abstract distanceToColors(distances: number[],
                              maxDistances: number[]): ImageData[];
    protected _distanceToColors(distances: number[], maxDistances: number[],
                                palette: ImageData[]): ImageData[] {
        return distances.map((d, i) => {
            if (maxDistances[i] === 0) {
                return palette[0];
            }
            return palette[Math.round((d / maxDistances[i])
                                      * DistancePalette.MAX_DISTANCE)];
        });
    }
}

export class GreyscalePalette extends DistancePalette {
    static palettePixels: ImageData[];
    constructor() {
        super();
        if (!GreyscalePalette.palettePixels) {
            GreyscalePalette.palettePixels = [];
            for (let i = 0; i <= DistancePalette.MAX_DISTANCE; i++) {
                /* ImageData constructor is experimental; with it we won't need
                the context. */
                // GreyscalePalette.palettePixels[i] = ctx.createImageData(1, 1);
                GreyscalePalette.palettePixels[i] = new ImageData(1, 1);
                GreyscalePalette.palettePixels[i].data[0] = 255 - i; // R
                GreyscalePalette.palettePixels[i].data[1] = 255 - i; // G
                GreyscalePalette.palettePixels[i].data[2] = 255 - i; // B
                GreyscalePalette.palettePixels[i].data[3] = 255; // alpha
            }
        }
    }
    distanceToColors(distances: number[],
                     maxDistances: number[]): ImageData[] {
        return this._distanceToColors(distances, maxDistances,
                                      GreyscalePalette.palettePixels);
    }
}

export class RedPalette extends DistancePalette {
    static palettePixels: ImageData[];
    constructor() {
        super();
        if (!RedPalette.palettePixels) {
            RedPalette.palettePixels = [];
            for (let i = 0; i <= DistancePalette.MAX_DISTANCE; i++) {
                RedPalette.palettePixels[i] = new ImageData(1, 1);
                RedPalette.palettePixels[i].data[0] = 255; // R
                RedPalette.palettePixels[i].data[1] = 255 - i; // G
                RedPalette.palettePixels[i].data[2] = 255 - i; // B
                RedPalette.palettePixels[i].data[3] = 255; // alpha
            }
        }
    }
    distanceToColors(distances: number[],
                     maxDistances: number[]): ImageData[] {
        return this._distanceToColors(distances, maxDistances,
                                      RedPalette.palettePixels);
    }
}

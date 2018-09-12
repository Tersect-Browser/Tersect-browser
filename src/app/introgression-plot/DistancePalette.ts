export abstract class DistancePalette {
    protected static MAX_DISTANCE = 255;
    /**
     * Create an array of pixels (ImageData objects) corresponding to the
     * provided array of distances. The color scale depends on the specific
     * palette class.
     * @param distances array if numbers representing genetic distance
     * @param max_distances list of maximum distances per bin, used for scaling
     */
    constructor() {}
    abstract distanceToColors(distances: number[],
                              max_distances: number[]): ImageData[];
    protected _distanceToColors(distances: number[], max_distances: number[],
                                palette: ImageData[]): ImageData[] {
        // const max_distance = Math.max(...distances);
        return distances.map((d, i) => {
            if (max_distances[i] === 0) {
                return palette[0];
            }
            return palette[Math.round((d / max_distances[i])
                                      * DistancePalette.MAX_DISTANCE)];
        });
    }
}

export class GreyscalePalette extends DistancePalette {
    static palette_pixels: ImageData[];
    constructor(ctx: CanvasRenderingContext2D) {
        super();
        if (!GreyscalePalette.palette_pixels) {
            GreyscalePalette.palette_pixels = [];
            for (let i = 0; i <= DistancePalette.MAX_DISTANCE; i++) {
                /* ImageData constructor is experimental; with it we won't need
                the context. */
                GreyscalePalette.palette_pixels[i] = ctx.createImageData(1, 1);
                GreyscalePalette.palette_pixels[i] = new ImageData(1, 1);
                GreyscalePalette.palette_pixels[i].data[0] = 255 - i; // R
                GreyscalePalette.palette_pixels[i].data[1] = 255 - i; // G
                GreyscalePalette.palette_pixels[i].data[2] = 255 - i; // B
                GreyscalePalette.palette_pixels[i].data[3] = 255; // alpha
            }
        }
    }
    distanceToColors(distances: number[],
                     max_distances: number[]): ImageData[] {
        return this._distanceToColors(distances, max_distances,
                                      GreyscalePalette.palette_pixels);
    }
}

export class RedPalette extends DistancePalette {
    static palette_pixels: ImageData[];
    constructor(ctx: CanvasRenderingContext2D) {
        super();
        if (!RedPalette.palette_pixels) {
            RedPalette.palette_pixels = [];
            for (let i = 0; i <= DistancePalette.MAX_DISTANCE; i++) {
                RedPalette.palette_pixels[i] = ctx.createImageData(1, 1);
                RedPalette.palette_pixels[i].data[0] = 255; // R
                RedPalette.palette_pixels[i].data[1] = 255 - i; // G
                RedPalette.palette_pixels[i].data[2] = 255 - i; // B
                RedPalette.palette_pixels[i].data[3] = 255; // alpha
            }
        }
    }
    distanceToColors(distances: number[],
                     max_distances: number[]): ImageData[] {
        return this._distanceToColors(distances, max_distances,
                                      RedPalette.palette_pixels);
    }
}

export abstract class DistancePalette {
    protected static _getDistanceColor(palette: ImageData[],
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

export class GreyscalePalette extends DistancePalette {
    private static readonly COLOR_NUM = 256;
    private static palette: ImageData[];

    static initialize() {
        if (!GreyscalePalette.palette) {
            GreyscalePalette.palette = [];
            for (let i = 0; i < GreyscalePalette.COLOR_NUM; i++) {
                GreyscalePalette.palette[i] = new ImageData(1, 1);
                GreyscalePalette.palette[i].data[0] = 255 - i; // R
                GreyscalePalette.palette[i].data[1] = 255 - i; // G
                GreyscalePalette.palette[i].data[2] = 255 - i; // B
                GreyscalePalette.palette[i].data[3] = 255; // alpha
            }
        }
    }

    static getDistanceColor(distance: number, maxDistance: number): ImageData {
        return super._getDistanceColor(GreyscalePalette.palette,
                                       distance, maxDistance);
    }
}
GreyscalePalette.initialize();

export class RedPalette extends DistancePalette {
    private static readonly COLOR_NUM = 256;
    private static palette: ImageData[];

    static initialize() {
        if (!RedPalette.palette) {
            RedPalette.palette = [];
            for (let i = 0; i < RedPalette.COLOR_NUM; i++) {
                RedPalette.palette[i] = new ImageData(1, 1);
                RedPalette.palette[i].data[0] = 255; // R
                RedPalette.palette[i].data[1] = 255 - i; // G
                RedPalette.palette[i].data[2] = 255 - i; // B
                RedPalette.palette[i].data[3] = 255; // alpha
            }
        }
    }

    static getDistanceColor(distance: number, maxDistance: number): ImageData {
        return super._getDistanceColor(RedPalette.palette,
                                       distance, maxDistance);
    }
}
RedPalette.initialize();

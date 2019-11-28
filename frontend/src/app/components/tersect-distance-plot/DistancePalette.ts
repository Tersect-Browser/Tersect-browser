import { ColorSpace, convertColorSpace, interpolateColors } from './utils/colors';

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

interface InterpolationOptions {
    inputColorSpace?: ColorSpace;
    colorSpace?: ColorSpace;
    levels?: number;
}

class InterpolatedPalette extends DistancePalette {
    private static readonly DEFAULT_COLOR_SPACE = 'rgb';
    private static readonly DEFAULT_LEVEL_NUM = 256;

    constructor(inputStartColor: number[],
                inputEndColor: number[],
                options: InterpolationOptions = {
                    inputColorSpace: InterpolatedPalette.DEFAULT_COLOR_SPACE,
                    colorSpace: InterpolatedPalette.DEFAULT_COLOR_SPACE,
                    levels: InterpolatedPalette.DEFAULT_LEVEL_NUM
                }) {
        super();
        options.inputColorSpace = options.inputColorSpace
                                  || InterpolatedPalette.DEFAULT_COLOR_SPACE;
        options.colorSpace      = options.colorSpace
                                  || InterpolatedPalette.DEFAULT_COLOR_SPACE;
        options.levels          = options.levels
                                  || InterpolatedPalette.DEFAULT_LEVEL_NUM;

        const startColor = convertColorSpace(inputStartColor,
                                             options.inputColorSpace,
                                             options.colorSpace);
        const endColor = convertColorSpace(inputEndColor,
                                           options.inputColorSpace,
                                           options.colorSpace);

        for (let i = 0; i < options.levels; i++) {
            const endWeight = i / (options.levels - 1);
            let color = interpolateColors(startColor, endColor, endWeight);
            color = convertColorSpace(color, options.colorSpace, 'rgb');
            color[3] = 255; // No alpha interpolation
            this.palette[i] = new ImageData(1, 1);
            this.palette[i].data.set(color);
        }
    }

    getDistanceColor(distance: number, maxDistance: number): ImageData {
        return this._getDistanceColor(this.palette, distance, maxDistance);
    }
}

export const GreyscalePalette = new InterpolatedPalette([255, 255, 255],
                                                        [0, 0, 0]);

export const RedPalette = new InterpolatedPalette([255, 255, 255],
                                                  [255, 0, 0]);

export const BlueToRedPalette = new InterpolatedPalette([0, 0, 255],
                                                        [255, 0, 0],
                                                        { colorSpace: 'hwb' });


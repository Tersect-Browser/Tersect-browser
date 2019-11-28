import * as convert from 'color-convert';

export type ColorSpace = 'rgb' | 'hsv' | 'hsl' | 'hwb';

export function convertColorSpace(color: number[],
                                  from: ColorSpace,
                                  to: ColorSpace) {
    if (from === to) {
        return color;
    } else {
        return convert[from][to](color);
    }
}

export function interpolateColors(startColor: number[],
                                  endColor: number[],
                                  endColorWeight: number) {
    if (startColor.length !== endColor.length) {
        throw new Error('Number of channels does not match');
    }
    if (endColorWeight < 0 || endColorWeight > 1) {
        throw new Error('endColorWeight must be between 0 and 1');
    }
    const color = [];
    for (let c = 0; c < startColor.length; c++) {
        color[c] = Math.round(
            startColor[c] + (endColor[c] - startColor[c]) * endColorWeight
        );
    }
    return color;
}

import { Component, Input, Output, EventEmitter } from '@angular/core';

@Component({
    selector: 'app-color-palette',
    templateUrl: './color-palette.component.html',
    styleUrls: ['./color-palette.component.css']
})
export class ColorPaletteComponent {
    private _selectedColor: string;
    @Input()
    set selectedColor(color: string) {
        this._selectedColor = color;
        this.selectedColorChange.emit(color);
    }
    get selectedColor(): string {
        return this._selectedColor;
    }

    @Output() selectedColorChange = new EventEmitter<string>();

    /**
     * Palette based on K. Kelly (1965): Twenty-two colors of maximum contrast.
     * The first color is empty and three of the 22 (white, black, and grey)
     * were left out.
     */
    @Input() palette: string[] = [
        undefined, // empty / no color
        '#f7c100', // yellow
        '#875492', // purple
        '#f78000', // orange
        '#9fcaf0', // light blue
        '#c0002d', // red
        '#c2b280', // buff
        '#008d4d', // green
        '#e68eab', // purplish pink
        '#0067a8', // blue
        '#f99179', // yellowish pink
        '#5e4c97', // violet
        '#fca300', // orange yellow
        '#b43f6b', // purplish red
        '#ded200', // greenish yellow
        '#892610', // reddish brown
        '#8eb700', // yellow green
        '#65431c', // yellowish brown
        '#e3541c', // reddish orange
        '#273a22'  // olive green
    ];

    selectColor(color: string) {
        this.selectedColor = color;
    }
}

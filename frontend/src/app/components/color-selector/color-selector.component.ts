import {
    Component,
    ElementRef,
    EventEmitter,
    Input,
    Output
} from '@angular/core';

import { fixedElementPosition } from '../../utils/utils';

export interface ColorChangeEvent {
    color: string;
    target?: any;
}

@Component({
    selector: 'app-color-selector',
    templateUrl: './color-selector.component.html',
    styleUrls: ['./color-selector.component.css']
})
export class ColorSelectorComponent {
    static readonly DEFAULT_HEADER = 'Select color';

    @Input()
    header = ColorSelectorComponent.DEFAULT_HEADER;

    @Output()
    colorChange = new EventEmitter<ColorChangeEvent>();

    target: any;

    private _color: string;

    private originalColor: string;

    constructor(private readonly el: ElementRef) { }

    get color(): string {
        return this._color;
    }
    set color(color: string) {
        this._color = color;
        this.colorChange.emit({ color: this.color, target: this.target });
    }

    private set position(pos: { x: number, y: number }) {
        this.el.nativeElement.style.left = `${pos.x}px`;
        this.el.nativeElement.style.top = `${pos.y}px`;
    }
    private get position(): { x: number, y: number } {
        return fixedElementPosition(this.el);
    }

    cancel() {
        this.color = this.originalColor;
        this.hide();
    }

    hide() {
        this.target = undefined;
        this.el.nativeElement.style.visibility = 'hidden';
    }

    show($event: MouseEvent, color?: string, target?: any) {
        this.target = target;
        this.color = color;
        this.originalColor = color;
        this.position = { x: $event.clientX, y: $event.clientY };
        this.el.nativeElement.style.visibility = 'visible';
    }
}

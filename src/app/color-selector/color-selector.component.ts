import { Component, ElementRef, Output, EventEmitter, Input } from '@angular/core';
import { fixedElementPosition } from '../utils/utils';
import { isNullOrUndefined } from 'util';

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
    constructor(private el: ElementRef) { }

    readonly DEFAULT_HEADER = 'Select color';
    @Input()
    header = this.DEFAULT_HEADER;

    target: any;

    _color: string;
    get color(): string {
        return this._color;
    }
    set color(color: string) {
        this._color = color;
        this.colorChange.emit({ color: this.color, target: this.target });
    }

    private original_color;

    @Output()
    colorChange = new EventEmitter<ColorChangeEvent>();

    private set position(pos: { x: number, y: number }) {
        this.el.nativeElement.style.left = `${pos.x}px`;
        this.el.nativeElement.style.top = `${pos.y}px`;
    }

    private get position(): { x: number, y: number } {
        return fixedElementPosition(this.el);
    }

    show($event: MouseEvent, color?: string, target?: any) {
        this.target = target;
        this.color = color;
        this.original_color = color;
        this.position = { x: $event.clientX, y: $event.clientY };
        this.el.nativeElement.style.visibility = 'visible';
    }

    hide() {
        this.target = undefined;
        this.el.nativeElement.style.visibility = 'hidden';
    }

    cancel() {
        this.color = this.original_color;
        this.hide();
    }
}

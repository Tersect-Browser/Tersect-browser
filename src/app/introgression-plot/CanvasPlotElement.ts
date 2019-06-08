import { HostListener, Output, EventEmitter } from '@angular/core';
import { PlotArea, PlotPosition, PlotMouseClickEvent, PlotMouseHoverEvent, PlotMouseMoveEvent } from '../models/PlotPosition';

export interface DragState {
    enable_dragging: boolean;
    dragged: boolean;
    drag_cursor: string;
    start_position: { x: number, y: number };
    current_position: { x: number, y: number };
    event: MouseEvent;
}

export interface ClickState {
    enable_clicking: boolean;
    click_position: { x: number, y: number };
    event: MouseEvent;
}

export interface HoverState {
    enable_hovering: boolean;
    hover_delay: number;
    hover_timer: NodeJS.Timer;
    hover_position: { x: number, y: number };
    event: MouseEvent;
}

export abstract class CanvasPlotElement {
    drag_state: DragState = {
        enable_dragging: true,
        dragged: false,
        drag_cursor: 'move',
        start_position: { x: 0, y: 0 },
        current_position: { x: 0, y: 0 },
        event: null
    };

    click_state: ClickState = {
        enable_clicking: true,
        click_position: { x: 0, y: 0 },
        event: null
    };

    hover_state: HoverState = {
        enable_hovering: true,
        hover_delay: 200,
        hover_timer: null,
        hover_position: { x: 0, y: 0},
        event: null
    };

    /**
     * Emitted when a plot element is clicked.
     */
    @Output() plotMouseClick = new EventEmitter<PlotMouseClickEvent>();

    /**
     * Emitted when mouse hovers over a plot element.
     */
    @Output() plotMouseHover = new EventEmitter<PlotMouseHoverEvent>();

    /**
     * Emitted when mouse moves or leaves a canvas plot element.
     */
    @Output() plotMouseMove = new EventEmitter<PlotMouseMoveEvent>();

    protected abstract dragStartAction(drag_state: DragState): void;
    protected abstract dragStopAction(drag_state: DragState): void;
    protected abstract dragAction(drag_state: DragState): void;
    protected abstract getPositionTarget(position: PlotPosition): PlotArea;

    /**
     * Default - feel free to override.
     */
    protected clickAction(click_state: ClickState): void {
        const target = this.getPositionTarget(click_state.click_position);
        this.plotMouseClick.emit({
            x: click_state.event.clientX,
            y: click_state.event.clientY,
            target: target,
        });
    }

    /**
     * Default - feel free to override.
     */
    protected hoverAction(hover_state: HoverState): void {
        const target = this.getPositionTarget(hover_state.hover_position);
        if (target.type !== 'background') {
            this.plotMouseHover.emit({
                x: hover_state.event.clientX,
                y: hover_state.event.clientY,
                target: target
            });
        }
    }

    @HostListener('mousemove', ['$event'])
    mouseMove($event: MouseEvent) {
        this.plotMouseMove.emit({ element: this.constructor.name });
        if (this.hover_state.enable_hovering && !this.drag_state.dragged) {
            this.hover_state.hover_position = {
                x: $event.offsetX,
                y: $event.offsetY
            };
            this.hover_state.event = $event;
            if (this.hover_state.hover_delay > 0) {
                clearTimeout(this.hover_state.hover_timer);
                this.hover_state.hover_timer = setTimeout(() => {
                    this.hoverAction(this.hover_state);
                }, this.hover_state.hover_delay);
            } else {
                // No delay
                this.hoverAction(this.hover_state);
            }
        }
        if (this.drag_state.dragged) {
            this.drag($event);
            this.dragAction(this.drag_state);
        }
    }

    @HostListener('mouseleave', ['$event'])
    mouseLeave($event: MouseEvent) {
        if (this.hover_state.enable_hovering) {
            clearTimeout(this.hover_state.hover_timer);
            this.plotMouseMove.emit({ element: this.constructor.name });
        }
    }

    @HostListener('mousedown', ['$event'])
    mouseDown($event: MouseEvent) {
        this.click_state.click_position = {
            x: $event.offsetX, y: $event.offsetY
        };
        if (this.drag_state.enable_dragging) {
            this.startDrag($event);
        }
    }

    @HostListener('mouseup', ['$event'])
    mouseUp($event: MouseEvent) {
        if (this.click_state.enable_clicking
            && this.click_state.click_position.x === $event.offsetX
            && this.click_state.click_position.y === $event.offsetY) {
            this.mouseClick($event);
        }
        this.stopDrag($event);
    }

    mouseClick($event: MouseEvent) {
        this.click_state.event = $event;
        this.clickAction(this.click_state);
    }

    drag($event: MouseEvent) {
        if ($event.buttons !== 1) {
            this.stopDrag($event);
            return;
        }
        this.drag_state.event = $event;
        const canvas = (event.target as HTMLCanvasElement);
        if (canvas.style.cursor !== this.drag_state.drag_cursor) {
            canvas.style.cursor = this.drag_state.drag_cursor;
        }
        this.drag_state.current_position = {
            x: $event.offsetX,
            y: $event.offsetY
        };
        this.dragAction(this.drag_state);
    }

    private startDrag($event: MouseEvent) {
        // drag on left mouse button
        if ($event.buttons === 1) {
            this.drag_state.event = $event;
            this.drag_state.dragged = true;
            this.drag_state.start_position = {
                x: $event.offsetX,
                y: $event.offsetY
            };
            this.dragStartAction(this.drag_state);
        }
    }

    private stopDrag($event: MouseEvent) {
        ($event.target as HTMLCanvasElement).style.cursor = 'auto';
        this.drag_state.event = $event;
        this.drag_state.dragged = false;
        this.dragStopAction(this.drag_state);
    }
}

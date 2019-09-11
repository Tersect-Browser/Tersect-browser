import { PlotArea, PlotPosition, PlotMouseClickEvent, PlotMouseHoverEvent, PlotMouseMoveEvent } from '../models/PlotPosition';

import { HostListener, Output, EventEmitter } from '@angular/core';

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
    dragState: DragState = {
        enable_dragging: true,
        dragged: false,
        drag_cursor: 'move',
        start_position: { x: 0, y: 0 },
        current_position: { x: 0, y: 0 },
        event: null
    };

    clickState: ClickState = {
        enable_clicking: true,
        click_position: { x: 0, y: 0 },
        event: null
    };

    hoverState: HoverState = {
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

    protected abstract dragStartAction(dragState: DragState): void;
    protected abstract dragStopAction(dragState: DragState): void;
    protected abstract dragAction(dragState: DragState): void;
    protected abstract getPositionTarget(position: PlotPosition): PlotArea;

    /**
     * Default - feel free to override.
     */
    protected clickAction(clickState: ClickState): void {
        const target = this.getPositionTarget(clickState.click_position);
        this.plotMouseClick.emit({
            x: clickState.event.clientX,
            y: clickState.event.clientY,
            target: target
        });
    }

    /**
     * Default - feel free to override.
     */
    protected hoverAction(hoverState: HoverState): void {
        const target = this.getPositionTarget(hoverState.hover_position);
        if (target.type !== 'background') {
            this.plotMouseHover.emit({
                x: hoverState.event.clientX,
                y: hoverState.event.clientY,
                target: target
            });
        }
    }

    @HostListener('mousemove', ['$event'])
    mouseMove($event: MouseEvent) {
        this.plotMouseMove.emit({
            element: this.constructor.name,
            buttons: $event.buttons
        });
        if (this.hoverState.enable_hovering && !this.dragState.dragged) {
            this.hoverState.hover_position = {
                x: $event.offsetX,
                y: $event.offsetY
            };
            this.hoverState.event = $event;
            if (this.hoverState.hover_delay > 0) {
                clearTimeout(this.hoverState.hover_timer);
                this.hoverState.hover_timer = setTimeout(() => {
                    this.hoverAction(this.hoverState);
                }, this.hoverState.hover_delay);
            } else {
                // No delay
                this.hoverAction(this.hoverState);
            }
        }
        if (this.dragState.dragged) {
            this.drag($event);
        }
    }

    @HostListener('mouseleave', ['$event'])
    mouseLeave($event: MouseEvent) {
        if (this.hoverState.enable_hovering) {
            clearTimeout(this.hoverState.hover_timer);
            this.plotMouseMove.emit({
                element: this.constructor.name,
                buttons: $event.buttons
            });
        }
    }

    @HostListener('mousedown', ['$event'])
    mouseDown($event: MouseEvent) {
        this.clickState.click_position = {
            x: $event.offsetX,
            y: $event.offsetY
        };
        if (this.dragState.enable_dragging) {
            this.startDrag($event);
        }
    }

    @HostListener('mouseup', ['$event'])
    mouseUp($event: MouseEvent) {
        if (this.clickState.enable_clicking
            && this.clickState.click_position.x === $event.offsetX
            && this.clickState.click_position.y === $event.offsetY) {
            this.mouseClick($event);
        }
        this.stopDrag($event);
    }

    mouseClick($event: MouseEvent) {
        this.clickState.event = $event;
        this.clickAction(this.clickState);
    }

    drag($event: MouseEvent) {
        if ($event.buttons !== 1) {
            this.stopDrag($event);
            return;
        }
        this.dragState.event = $event;
        const canvas = (event.target as HTMLCanvasElement);
        if (canvas.style.cursor !== this.dragState.drag_cursor) {
            canvas.style.cursor = this.dragState.drag_cursor;
        }
        this.dragState.current_position = {
            x: $event.clientX,
            y: $event.clientY
        };
        this.dragAction(this.dragState);
    }

    protected startDrag($event: MouseEvent) {
        // drag on left mouse button
        if ($event.buttons === 1) {
            this.dragState.event = $event;
            this.dragState.dragged = true;
            this.dragState.start_position = {
                x: $event.clientX,
                y: $event.clientY
            };
            this.dragStartAction(this.dragState);
        }
    }

    protected stopDrag($event: MouseEvent) {
        ($event.target as HTMLCanvasElement).style.cursor = 'auto';
        this.dragState.event = $event;
        this.dragState.dragged = false;
        this.dragStopAction(this.dragState);
        this.plotMouseMove.emit();
    }
}

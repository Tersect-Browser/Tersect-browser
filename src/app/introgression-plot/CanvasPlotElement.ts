import {
    EventEmitter,
    HostListener,
    Output
} from '@angular/core';

import {
    PlotArea,
    PlotMouseClickEvent,
    PlotMouseHoverEvent,
    PlotMouseMoveEvent,
    PlotPosition
} from '../models/PlotPosition';

export interface ClickState {
    enableClicking: boolean;
    clickPosition: { x: number, y: number };
    event: MouseEvent;
}

export interface DragState {
    enableDragging: boolean;
    dragged: boolean;
    dragCursor: string;
    startPosition: { x: number, y: number };
    currentPosition: { x: number, y: number };
    event: MouseEvent;
}

export interface HoverState {
    enableHovering: boolean;
    hoverDelay: number;
    hoverTimer: NodeJS.Timer;
    hoverPosition: { x: number, y: number };
    event: MouseEvent;
}

export abstract class CanvasPlotElement {
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

    clickState: ClickState = {
        enableClicking: true,
        clickPosition: { x: 0, y: 0 },
        event: null
    };

    dragState: DragState = {
        enableDragging: true,
        dragged: false,
        dragCursor: 'move',
        startPosition: { x: 0, y: 0 },
        currentPosition: { x: 0, y: 0 },
        event: null
    };

    hoverState: HoverState = {
        enableHovering: true,
        hoverDelay: 200,
        hoverTimer: null,
        hoverPosition: { x: 0, y: 0},
        event: null
    };

    drag($event: MouseEvent) {
        if ($event.buttons !== 1) {
            this.stopDrag($event);
            return;
        }
        this.dragState.event = $event;
        const canvas = ($event.target as HTMLCanvasElement);
        if (canvas.style.cursor !== this.dragState.dragCursor) {
            canvas.style.cursor = this.dragState.dragCursor;
        }
        this.dragState.currentPosition = {
            x: $event.clientX,
            y: $event.clientY
        };
        this.dragAction(this.dragState);
    }

    mouseClick($event: MouseEvent) {
        this.clickState.event = $event;
        this.clickAction(this.clickState);
    }

    protected abstract dragStartAction(dragState: DragState): void;
    protected abstract dragStopAction(dragState: DragState): void;
    protected abstract dragAction(dragState: DragState): void;
    protected abstract getPositionTarget(position: PlotPosition): PlotArea;

    /**
     * Default - feel free to override.
     */
    protected clickAction(clickState: ClickState): void {
        const target = this.getPositionTarget(clickState.clickPosition);
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
        const target = this.getPositionTarget(hoverState.hoverPosition);
        if (target.plotAreaType !== 'background') {
            this.plotMouseHover.emit({
                x: hoverState.event.clientX,
                y: hoverState.event.clientY,
                target: target
            });
        }
    }

    protected startDrag($event: MouseEvent) {
        // drag on left mouse button
        if ($event.buttons === 1) {
            this.dragState.event = $event;
            this.dragState.dragged = true;
            this.dragState.startPosition = {
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

    @HostListener('mousedown', ['$event'])
    mouseDown($event: MouseEvent) {
        this.clickState.clickPosition = {
            x: $event.offsetX,
            y: $event.offsetY
        };
        if (this.dragState.enableDragging) {
            this.startDrag($event);
        }
    }

    @HostListener('mouseleave', ['$event'])
    mouseLeave($event: MouseEvent) {
        if (this.hoverState.enableHovering) {
            clearTimeout(this.hoverState.hoverTimer);
            this.plotMouseMove.emit({
                element: this.constructor.name,
                buttons: $event.buttons
            });
        }
    }

    @HostListener('mousemove', ['$event'])
    mouseMove($event: MouseEvent) {
        this.plotMouseMove.emit({
            element: this.constructor.name,
            buttons: $event.buttons
        });
        if (this.hoverState.enableHovering && !this.dragState.dragged) {
            this.hoverState.hoverPosition = {
                x: $event.offsetX,
                y: $event.offsetY
            };
            this.hoverState.event = $event;
            if (this.hoverState.hoverDelay > 0) {
                clearTimeout(this.hoverState.hoverTimer);
                this.hoverState.hoverTimer = setTimeout(() => {
                    this.hoverAction(this.hoverState);
                }, this.hoverState.hoverDelay);
            } else {
                // No delay
                this.hoverAction(this.hoverState);
            }
        }
        if (this.dragState.dragged) {
            this.drag($event);
        }
    }

    @HostListener('mouseup', ['$event'])
    mouseUp($event: MouseEvent) {
        if (this.clickState.enableClicking
            && this.clickState.clickPosition.x === $event.offsetX
            && this.clickState.clickPosition.y === $event.offsetY) {
            this.mouseClick($event);
        }
        this.stopDrag($event);
    }
}

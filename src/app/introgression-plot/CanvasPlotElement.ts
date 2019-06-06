import { HostListener } from '@angular/core';

export interface DragState {
    enable_dragging: boolean;
    dragged: boolean;
    drag_cursor: string;
    drag_start_position: { x: number, y: number };
    current_position: { x: number, y: number };
}

export interface ClickState {
    enable_clicking: boolean;
    click_position: { x: number, y: number };
}

export abstract class CanvasPlotElement {
    drag_state: DragState = {
        enable_dragging: true,
        dragged: false,
        drag_cursor: 'move',
        drag_start_position: { x: 0, y: 0 },
        current_position: { x: 0, y: 0 }
    };

    click_state: ClickState = {
        enable_clicking: true,
        click_position: { x: 0, y: 0 }
    };

    abstract dragStartAction(drag_state: DragState): void;
    abstract dragStopAction(drag_state: DragState): void;
    abstract dragAction(drag_state: DragState): void;
    abstract clickAction(click_state: ClickState): void;

    @HostListener('mousemove')
    mouseMove(event: MouseEvent) {
        if (this.drag_state.dragged) {
            this.drag(event);
            this.dragAction(this.drag_state);
        }
    }

    @HostListener('mousedown')
    mouseDown(event: MouseEvent) {
        this.click_state.click_position = {
            x: event.layerX, y: event.layerY
        };
        if (this.drag_state.enable_dragging) {
            this.startDrag(event);
        }
    }

    @HostListener('mouseup')
    mouseUp(event: MouseEvent) {
        if (this.click_state.enable_clicking
            && this.click_state.click_position.x === event.layerX
            && this.click_state.click_position.y === event.layerY) {
            this.mouseClick(event);
        }
        this.stopDrag(event);
    }

    mouseClick(event: MouseEvent) {
        this.clickAction(this.click_state);
    }

    drag(event: MouseEvent) {
        if (event.buttons !== 1) {
            this.stopDrag(event);
            return;
        }
        const canvas = (event.target as HTMLCanvasElement);
        if (canvas.style.cursor !== this.drag_state.drag_cursor) {
            canvas.style.cursor = this.drag_state.drag_cursor;
        }
        this.drag_state.current_position = {
            x: event.layerX,
            y: event.layerY
        };
        this.dragAction(this.drag_state);
    }

    private startDrag(event: MouseEvent) {
        // drag on left mouse button
        if (event.buttons === 1) {
            this.drag_state.dragged = true;
            this.drag_state.drag_start_position = {
                x: event.layerX,
                y: event.layerY
            };
            this.dragStartAction(this.drag_state);
        }
    }

    private stopDrag(event: MouseEvent) {
        (event.target as HTMLCanvasElement).style.cursor = 'auto';
        this.drag_state.dragged = false;
        this.dragStopAction(this.drag_state);
    }
}

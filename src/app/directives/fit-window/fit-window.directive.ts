import { fixedElementPosition } from '../../utils/utils';

import { Directive, ElementRef, Input } from '@angular/core';

@Directive({
    selector: '[appFitWindow]'
})
export class FitWindowDirective {
    @Input()
    cursorOffsetX = 0;

    @Input()
    cursorOffsetY = 0;

    private readonly observer = new MutationObserver(() => {
        this.adjustPosition();
    });

    private get position(): { x: number, y: number } {
        return fixedElementPosition(this.el);
    }

    private set position(pos: { x: number, y: number }) {
        this.el.nativeElement.style.left = `${pos.x}px`;
        this.el.nativeElement.style.top = `${pos.y}px`;
    }

    constructor(private readonly el: ElementRef) {
        this.observer.observe(this.el.nativeElement, { attributes: true });
    }

    /**
     * Adjusts menu position so that is does not overflow.
     */
    private adjustPosition() {
        const width = this.el.nativeElement.offsetWidth;
        const height = this.el.nativeElement.offsetHeight;

        if (width > window.innerWidth
            || height > window.innerHeight) {
            // No way to fit the menu inside the plot area
            return;
        }

        const pos = this.position;
        const xOverflow = pos.x + width - window.innerWidth;
        const yOverflow = pos.y + height - window.innerHeight;

        if (xOverflow > 0 || yOverflow > 0) {
            this.position = {
                x: xOverflow > 0 ? pos.x - xOverflow - this.cursorOffsetX
                                 : pos.x,
                y: yOverflow > 0 ? pos.y - height - this.cursorOffsetY
                                 : pos.y
            };
            this.el.nativeElement.style.visibility = 'visible';
        }
    }
}

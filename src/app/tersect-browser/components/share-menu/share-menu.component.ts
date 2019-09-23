import { PlatformLocation } from '@angular/common';
import { Component, ViewChild } from '@angular/core';

import { join } from 'path';
import { OverlayPanel } from 'primeng/overlaypanel';

import {
    TersectBackendService
} from '../../../shared/services/tersect-backend.service';
import {
    PlotStateService
} from '../../../tersect-distance-plot/services/plot-state.service';

@Component({
    selector: 'app-share-menu',
    templateUrl: 'share-menu.component.html',
    styleUrls: ['share-menu.component.css']
})
export class ShareMenuComponent {
    @ViewChild(OverlayPanel, { static: true })
    private readonly panel: OverlayPanel;

    shareLink: string;

    constructor(private readonly plotState: PlotStateService,
                private readonly tersectBackendService: TersectBackendService,
                private readonly platformLocation: PlatformLocation) { }

    clearLink() {
        this.shareLink = '';
    }

    /**
     * Copy view share link to clipboard.
     */
    copyLink() {
        document.addEventListener('copy', ($e: ClipboardEvent) => {
            $e.clipboardData.setData('text/plain', this.shareLink);
            $e.preventDefault();
            document.removeEventListener('copy', null);
        });
        document.execCommand('copy');
    }

    exportView() {
        this.tersectBackendService.exportSettings(this.plotState.settings)
                                  .subscribe(id => {
            const host = this.platformLocation['location'].origin;
            this.shareLink = join(host, 'TersectBrowser', 'share', id);
        });
    }

    toggle($event: Event) {
        this.panel.toggle($event);
    }
}

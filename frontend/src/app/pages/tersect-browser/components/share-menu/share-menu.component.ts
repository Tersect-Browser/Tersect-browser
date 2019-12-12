import { PlatformLocation } from '@angular/common';
import { Component, ViewChild } from '@angular/core';

import { OverlayPanel } from 'primeng/overlaypanel';

import {
    PlotStateService
} from '../../../../components/tersect-distance-plot/services/plot-state.service';
import {
    TersectBackendService
} from '../../../../services/tersect-backend.service';

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
            const shareURL = new URL(`share/${id}`, document.baseURI);
            this.shareLink = shareURL.href;
        });
    }

    toggle($event: Event) {
        this.panel.toggle($event);
    }
}

import { PlatformLocation } from '@angular/common';
import { Component } from '@angular/core';

import { join } from 'path';

import {
    PlotStateService
} from '../../introgression-plot/services/plot-state.service';
import {
    TersectBackendService
} from '../../services/tersect-backend.service';

@Component({
    selector: 'app-share-button',
    templateUrl: 'share-button.component.html',
    styleUrls: ['share-button.component.css']
})
export class ShareButtonComponent {
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
            this.shareLink = join(host, 'TersectBrowser', 'share',
                                  id.toString());
        });
    }
}

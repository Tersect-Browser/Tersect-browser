import { Component } from '@angular/core';

import { saveAs } from 'file-saver';

import {
    ExportPlotService
} from '../../services/export-plot.service';

@Component({
    selector: 'app-download-dialog',
    templateUrl: './download-dialog.component.html',
    providers: [
        ExportPlotService
    ]
})
export class DownloadDialogComponent {
    visible = false;

    constructor(private readonly exportPlotService: ExportPlotService) { }

    downloadImage() {
        const imageData = this.exportPlotService.exportImage();
        imageData.then(blob => {
            saveAs(blob, 'output.png');
            this.hide();
        });
    }

    hide() {
        this.visible = false;
    }

    show() {
        this.visible = true;
    }
}

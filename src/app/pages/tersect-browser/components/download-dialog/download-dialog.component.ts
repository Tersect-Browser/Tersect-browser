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

    private imageData: Promise<Blob>;

    downloadImage() {
        this.imageData.then(blob => {
            saveAs(blob, 'output.png');
            this.hide();
        });
    }

    hide() {
        this.visible = false;
    }

    show() {
        this.imageData = this.exportPlotService.exportImage();
        this.visible = true;
    }
}

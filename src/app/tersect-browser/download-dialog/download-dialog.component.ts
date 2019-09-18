import { Component } from '@angular/core';

import { saveAs } from 'file-saver';

@Component({
    selector: 'app-download-dialog',
    templateUrl: './download-dialog.component.html'
})
export class DownloadDialogComponent {
    visible = false;

    private imageData: Promise<Blob>;

    downloadImage() {
        this.imageData.then(blob => {
            saveAs(blob, 'output.png');
            this.hideDialog();
        });
    }

    hideDialog() {
        this.visible = false;
    }

    showDialog(imageData: Promise<Blob>) {
        this.imageData = imageData;
        this.visible = true;
    }
}

import { Component } from '@angular/core';

import { saveAs } from 'file-saver';

import {
    PlotStateService
} from '../../../../components/tersect-distance-plot/services/plot-state.service';
import {
    AccessionTreeView
} from '../../../../models/AccessionTreeView';
import {
    DistanceBinView
} from '../../../../models/DistanceBinView';
import {
    isNullOrUndefined
} from '../../../../utils/utils';
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
    private static readonly DEFAULT_BIN_HEIGHT = 10;

    binView: DistanceBinView;
    treeView: AccessionTreeView;

    binHeight = DownloadDialogComponent.DEFAULT_BIN_HEIGHT;

    visible = false;

    constructor(private readonly plotState: PlotStateService,
                private readonly exportPlotService: ExportPlotService) { }

    get height(): number {
        if (!isNullOrUndefined(this.binView)) {
            return this.binView.getImageSize().height;
        } else {
            return undefined;
        }
    }

    get width(): number {
        if (!isNullOrUndefined(this.binView)) {
            return this.binView.getImageSize().width;
        } else {
            return undefined;
        }
    }

    downloadImage() {
        const imageData = this.exportPlotService.exportImage(this.binView,
                                                             this.treeView);
        imageData.then(blob => {
            saveAs(blob, 'output.png');
            this.hide();
        });
    }

    hide() {
        this.visible = false;
    }

    show() {
        this.prepareViews();
        this.visible = true;
    }

    private prepareViews() {
        this.binView = new DistanceBinView(this.plotState.distanceBins,
                                           this.plotState.orderedAccessions,
                                           this.binHeight);
        this.binView.sequenceGaps = this.plotState.sequenceGaps;
        this.treeView = new AccessionTreeView(this.plotState.pheneticTree,
                                              this.binHeight);
    }
}

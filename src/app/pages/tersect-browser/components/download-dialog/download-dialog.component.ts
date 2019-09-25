import { Component } from '@angular/core';

import { saveAs } from 'file-saver';

import {
    AccessionDisplayStyle
} from '../../../../components/tersect-distance-plot/models/PlotState';
import {
    PlotStateService
} from '../../../../components/tersect-distance-plot/services/plot-state.service';
import {
    ContainerSize
} from '../../../../components/tersect-distance-plot/tersect-distance-plot.component';
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
    styleUrls: [ './download-dialog.component.css' ],
    providers: [
        ExportPlotService
    ]
})
export class DownloadDialogComponent {
    private static readonly DEFAULT_BIN_HEIGHT = 10;

    binView: DistanceBinView;
    loading = false;
    totalSize: ContainerSize = { height: undefined, width: undefined };
    treeView: AccessionTreeView;
    visible = false;

    private _accessionStyle: AccessionDisplayStyle = 'labels';
    private _binHeight = DownloadDialogComponent.DEFAULT_BIN_HEIGHT;

    constructor(private readonly plotState: PlotStateService,
                private readonly exportPlotService: ExportPlotService) { }

    set accessionStyle(accessionStyle: AccessionDisplayStyle) {
        this._accessionStyle = accessionStyle;
        this.treeView.accessionStyle = accessionStyle;
        this.updateTotalSize();
    }
    get accessionStyle(): AccessionDisplayStyle {
        return this._accessionStyle;
    }

    set binHeight(binHeight: number) {
        this._binHeight = binHeight;
        this.binView.binHeight = this._binHeight;
        this.treeView.textSize = this._binHeight;
        this.updateTotalSize();
    }
    get binHeight(): number {
        return this._binHeight;
    }

    set labelWidth(labelWidth: number) {
        this.treeView.containerSize = {
            height: this.treeView.containerSize.height,
            width: labelWidth
        };
        this.updateTotalSize();
    }
    get labelWidth(): number {
        if (!isNullOrUndefined(this.treeView)) {
            return this.exportPlotService.getLabelWidth(this.treeView);
        } else {
            return undefined;
        }
    }

    downloadImage() {
        this.loading = true;
        setTimeout(() => {
            // Timeout to update progress bar immediately
            const imageData = this.exportPlotService.exportImage(this.binView,
                                                                 this.treeView);
            imageData.then(blob => {
                if (this.loading) {
                    this.loading = false;
                    saveAs(blob, 'output.png');
                    this.hide();
                }
            });
        }, 200);
    }

    hide() {
        this.loading = false;
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
                                              this.plotState.orderedAccessions,
                                              this.binHeight);
        this.treeView.accessionDictionary = this.plotState.accessionDictionary;
        this.treeView.accessionStyle = this.accessionStyle;
        this.updateTotalSize();
    }

    private updateTotalSize() {
        this.totalSize = this.exportPlotService.getTotalSize(this.binView,
                                                             this.treeView);
    }
}

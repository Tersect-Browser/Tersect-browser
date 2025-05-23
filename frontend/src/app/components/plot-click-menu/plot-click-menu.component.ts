import { Component, ElementRef, EventEmitter, Output } from '@angular/core';
import { MenuItem } from 'primeng/components/common/menuitem';

import {
    PlotAccession,
    PlotBin,
    PlotMouseClickEvent,
    PlotSequenceInterval,
    PlotSequencePosition
} from '../../models/Plot';
import {
    formatPosition
} from '../../utils/utils';
import { ModalService } from '../../pages/tersect-browser/services/modal.service';
import { PlotStateService } from '../tersect-distance-plot/services/plot-state.service';

@Component({
    selector: 'app-plot-click-menu',
    templateUrl: './plot-click-menu.component.html',
    styleUrls: ['./plot-click-menu.component.css']
})
export class PlotClickMenuComponent {
    @Output() removeAccession = new EventEmitter<string>();
    @Output() setInterval = new EventEmitter<number[]>();
    @Output() setIntervalStart = new EventEmitter<number>();
    @Output() setIntervalEnd = new EventEmitter<number>();
    @Output() setReference = new EventEmitter<string>();

    menuItems: MenuItem[] = [];


    constructor(private readonly el: ElementRef, private modalService: ModalService, private plotStateService: PlotStateService) { }

    private set position(pos: { x: number, y: number }) {
        this.el.nativeElement.style.left = `${pos.x}px`;
        this.el.nativeElement.style.top = `${pos.y}px`;
    }


    hide() {
        this.position = { x: 0, y: 0 };
        this.el.nativeElement.style.visibility = 'hidden';
    }

    show($event: PlotMouseClickEvent) {
        if ($event.target.plotAreaType === 'accession') {
            this.menuItems = [
                this.getAccessionItem($event.target as PlotAccession)
            ];
        } else if ($event.target.plotAreaType === 'bin') {
            this.menuItems = [
                this.getAccessionItem($event.target as PlotBin),
                this.getBinItem($event.target as PlotBin)
            ];
        } else if ($event.target.plotAreaType === 'position') {
            this.menuItems = [
                this.getPositionItem($event.target as PlotSequencePosition)
            ];
        } else if ($event.target.plotAreaType === 'interval') {
            this.menuItems = [
                this.getIntervalItem($event.target as PlotSequenceInterval)
            ];
        } else {
            // Menu not visible for other types
            return;
        }

        this.position = { x: $event.x, y: $event.y };
        this.el.nativeElement.style.visibility = 'visible';
    }


    private getAccessionItem(targetAccession: PlotAccession): MenuItem {
        return {
            label: targetAccession.accessionLabel,
            items: [
                {
                    label: 'Set as reference',
                    icon: 'fa fa-star-o',
                    command: () => {
                        this.setReference.emit(targetAccession.accession);
                        this.hide();
                    }
                },
                {
                    label: 'Remove from plot',
                    icon: 'fa fa-remove',
                    command: () => {
                        this.removeAccession.emit(targetAccession.accession);
                        this.hide();
                    }
                },
                {
                    label: 'View in browser',
                    icon: 'fa fa-binoculars',
                    command: () => {
                        this.modalService.openElementModal({
                            location: {
                                start: targetAccession.startPosition,
                                end: targetAccession.endPosition,
                                zoomLevel: this.plotStateService.zoomLevel,
                                pheneticWidth: this.plotStateService.pheneticTree.root.length,
                                binSize: this.plotStateService.binsize,
                                selectedInterval: this.plotStateService.interval,
                                chromosome: this.plotStateService.chromosome,
                                defaultInterval: [1, this.plotStateService.chromosome.size],
                                preselectedChromosome: this.plotStateService.chromosome,
                                accession: {
                                    start: targetAccession.startPosition,
                                    end: targetAccession.endPosition,
                                    zoomLevel: this.plotStateService.zoomLevel,
                                    pheneticWidth: this.plotStateService.pheneticTree.root.length,
                                    binSize: this.plotStateService.binsize,
                                    name: targetAccession.accessionLabel,
                                    preselectedChromosome: this.plotStateService.chromosome,
                                    chromosome: this.plotStateService.chromosome,
                                    selectedInterval: this.plotStateService.interval,
                                    defaultInterval: [targetAccession.startPosition || 1, targetAccession.endPosition || this.plotStateService.chromosome.size],
                                }
                            }
                        });
                        this.hide();
                    }
                }
            ]
        };
    }

    private getBinItem(bin: PlotBin): MenuItem {
        return {
            label: `${formatPosition(bin.startPosition)}
- ${formatPosition(bin.endPosition)}`,
            items: [
                {
                    label: 'Set as interval start',
                    icon: 'fa fa-chevron-left',
                    command: () => {
                        this.setIntervalStart.emit(bin.startPosition);
                        this.hide();
                    }
                },
                {
                    label: 'Set as interval end',
                    icon: 'fa fa-chevron-right',
                    command: () => {
                        this.setIntervalEnd.emit(bin.endPosition);
                        this.hide();
                    }
                },
                 {
                    label: 'Search for variants',
                    icon: 'fa fa-search',
                    command: () => {
                        window.dispatchEvent(new CustomEvent("tersect-search-variants", { detail: {
                            interval: [bin.startPosition, bin.endPosition]
                        } }));
  
                        this.hide();
                    }
                },
                {
                    label: 'Create barcode',
                    icon: 'fa fa-barcode',
                    command: () => {
                        console.log(this.modalService.openBarcodeModal)
                        this.modalService.openBarcodeModal(bin.accessionLabel, 
                            this.plotStateService.chromosome.name, 
                            bin.startPosition, 
                            bin.endPosition,
                            this.plotStateService.datasetId
                        );

                        
                        console.log('barcode service opened')
                        console.log('Accession:', bin.accessionLabel)
                        console.log('chrom', this.plotStateService.chromosome.name)
                        console.log('start', bin.startPosition)
                        console.log('end', bin.endPosition)

                        this.hide();
                    }

                }
            ]
        };
    }

    private getIntervalItem(int: PlotSequenceInterval): MenuItem {
        return {
            label: `${formatPosition(int.startPosition)}
- ${formatPosition(int.endPosition)}`,
            items: [
                {
                    label: 'Set as interval',
                    icon: 'fa fa-arrows-h',
                    command: () => {
                        this.setInterval.emit([int.startPosition,
                                               int.endPosition]);
                        this.hide();
                    }
                },
                {
                    label: 'Search for variants',
                    icon: 'fa fa-search',
                    command: () => {
                        window.dispatchEvent(new CustomEvent("tersect-search-variants", { detail: {
                            interval: [int.startPosition, int.endPosition],
                            waitTime: 40000
                        } }));
                        // this.setInterval.emit([int.startPosition,
                        //                        int.endPosition]);
                        this.hide();
                    }
                }
            ]
        };
    }

    private getPositionItem(pos: PlotSequencePosition): MenuItem {
        return {
            label: `${formatPosition(pos.position)}`,
            items: [
                {
                    label: 'Set as interval start',
                    icon: 'fa fa-chevron-left',
                    command: () => {
                        this.setIntervalStart.emit(pos.position);
                        this.hide();
                    }
                },
                {
                    label: 'Set as interval end',
                    icon: 'fa fa-chevron-right',
                    command: () => {
                        this.setIntervalEnd.emit(pos.position);
                        this.hide();
                    }
                }
            ]
        };
    }
}

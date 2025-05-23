import { Component, Input } from '@angular/core';

import { SelectItem } from 'primeng/components/common/selectitem';

import {
    PlotStateService
} from '../../../../components/tersect-distance-plot/services/plot-state.service';
import {
    Chromosome
} from '../../../../models/Chromosome';
import {
    formatPosition,
    isNullOrUndefined
} from '../../../../utils/utils';

@Component({
    selector: 'app-chromosome-selector',
    templateUrl: './chromosome-selector.component.html'
})
export class ChromosomeSelectorComponent {
    @Input()
    set chromosomes(chroms: Chromosome[]) {
        if (isNullOrUndefined(chroms)) {
            return;
        }
        this.chromosomeOptions = chroms.map(chrom => ({
            label: `${chrom.name} (${formatPosition(chrom.size, 'Mbp')})`,
            value: chrom
        }));
    }

    chromosomeOptions: SelectItem[];

    constructor(private readonly plotState: PlotStateService) { }

    set selectedChromosome(chrom: Chromosome) {
        if (this.plotState.chromosome.name !== chrom.name
            || this.plotState.chromosome.size !== chrom.size) {
            this.plotState.chromosome = chrom;
            this.plotState.interval = [1, chrom.size];
        }
    }
    get selectedChromosome(): Chromosome {
        return this.plotState.chromosome;
    }
}

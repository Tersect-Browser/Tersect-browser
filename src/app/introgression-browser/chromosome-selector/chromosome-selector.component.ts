import { Component, Input } from '@angular/core';
import { SelectItem } from 'primeng/components/common/selectitem';
import { Chromosome } from '../../models/Chromosome';
import { formatPosition, isNullOrUndefined } from '../../utils/utils';
import { PlotStateService } from '../../introgression-plot/services/plot-state.service';

@Component({
    selector: 'app-chromosome-selector',
    templateUrl: './chromosome-selector.component.html'
})
export class ChromosomeSelectorComponent {
    chromosomeOptions: SelectItem[];

    set selectedChromosome(chrom: Chromosome) {
        if (this.plotState.chromosome.name !== chrom.name
            || this.plotState.chromosome.size !== chrom.size) {
            this.plotState.interval = [1, chrom.size];
            this.plotState.chromosome = chrom;
        }
    }
    get selectedChromosome(): Chromosome {
        return this.plotState.chromosome;
    }

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

    constructor(private plotState: PlotStateService) { }
}

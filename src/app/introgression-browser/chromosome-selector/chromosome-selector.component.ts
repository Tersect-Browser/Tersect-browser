import { Component, Input, Output, EventEmitter } from '@angular/core';
import { SelectItem } from 'primeng/components/common/selectitem';
import { Chromosome } from '../../models/Chromosome';
import { formatPosition } from '../../utils/utils';
import { isNullOrUndefined } from 'util';

@Component({
    selector: 'app-chromosome-selector',
    templateUrl: './chromosome-selector.component.html'
})
export class ChromosomeSelectorComponent {
    chromosomeOptions: SelectItem[];

    _selectedChromosome: Chromosome;

    @Input()
    set selectedChromosome(chromosome: Chromosome) {
        if (!isNullOrUndefined(chromosome)) {
            this._selectedChromosome = chromosome;
            this.selectedChromosomeChange.emit(chromosome);
        }
    }

    get selectedChromosome(): Chromosome {
        return this._selectedChromosome;
    }

    @Output()
    selectedChromosomeChange = new EventEmitter<Chromosome>();

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
}

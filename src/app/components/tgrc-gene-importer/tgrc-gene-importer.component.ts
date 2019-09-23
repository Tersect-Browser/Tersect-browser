import { Component, OnInit, ViewEncapsulation } from '@angular/core';

import { SelectItem } from 'primeng/components/common/selectitem';

import {
    GeneTGRC
} from '../../../backend/models/genetgrc';
import {
    AccessionAlleles,
    TGRCBackendService
} from '../../services/tgrc-backend.service';
import {
    AccessionInfoImporterComponent
} from '../accession-tab/components/plugins/accession-info-importer.component';

@Component({
    selector: 'app-tgrc-gene-importer',
    templateUrl: './tgrc-gene-importer.component.html',
    styleUrls: ['./tgrc-gene-importer.component.css'],
    encapsulation: ViewEncapsulation.None
})
export class TGRCGeneImporterComponent extends AccessionInfoImporterComponent
                                       implements OnInit {
    selectedTgrcGene: string;
    tgrcGenes: SelectItem[];

    constructor(private readonly tgrcBackendService: TGRCBackendService) {
        super();
    }

    ngOnInit() {
        const accessionTgrcNums = this.infos.map(info => info['TGRC #']);
        this.tgrcBackendService.getTGRCAccessionGenes(accessionTgrcNums)
                               .subscribe((genes: GeneTGRC[]) => {
            this.tgrcGenes = genes.map(gene => ({
                label: gene.locusName.length ? `${gene.gene} (${gene.locusName})`
                                             : `${gene.gene}`,
                value: gene.gene
            }));
        });
    }

    importTgrcGene(gene: string) {
        this.tgrcBackendService.getTGRCGeneAccessions(gene)
                               .subscribe((ga: AccessionAlleles) => {
            this.selectedTgrcGene = '';

            this.infosChange.emit(this.infos.map(opt => {
                if (opt['TGRC #'] in ga) {
                    opt[gene] = ga[opt['TGRC #']].allele;
                } else {
                    opt[gene] = '';
                }
                return opt;
            }));
        });
    }
}

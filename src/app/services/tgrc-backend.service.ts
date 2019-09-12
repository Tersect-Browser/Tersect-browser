import { HttpClient } from '@angular/common/http';
import { Inject, Injectable } from '@angular/core';

import { forkJoin, Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { AccessionTGRC } from '../../backend/db/accessiontgrc';
import { GeneTGRC } from '../../backend/db/genetgrc';
import { APP_CONFIG, AppConfig } from '../app.config';

export interface AccessionAlleles {
    [tgrcId: string]: {
        gene: string;
        allele: string;
    };
}

@Injectable()
export class TGRCBackendService {
    private readonly apiUrl: string;

    constructor(private readonly http: HttpClient,
                @Inject(APP_CONFIG) config: AppConfig) {
        this.apiUrl = config.tgrcApiUrl;
    }

    getTGRCGenes(): Observable<GeneTGRC[]> {
        return this.http.get<GeneTGRC[]>(`${this.apiUrl}/genes`);
    }

    getTGRCAccessions(): Observable<AccessionTGRC[]> {
        return this.http.get<AccessionTGRC[]>(`${this.apiUrl}/accessions`);
    }

    getTGRCAccessionGenes(accessions: string[]): Observable<GeneTGRC[]> {
        // TODO: implement this more efficiently on the back end
        return forkJoin([this.getTGRCGenes(), this.getTGRCAccessions()]).pipe(
            map(([allGenes, allAcc]) => {
                const geneIds = new Set();
                allAcc.filter(acc => accessions.includes(acc.accession))
                      .forEach(acc => {
                    acc.alleles.forEach(allele => geneIds.add(allele.gene));
                });
                return allGenes.filter(gene => geneIds.has(gene.gene));
            })
        );
    }

    getTGRCGeneAccessions(gene: string): Observable<AccessionAlleles> {
        const query = `${this.apiUrl}/accessions/${gene}/1`;
        return this.http.get<AccessionTGRC[]>(query).pipe(
            map((accTGRC: AccessionTGRC[]) => {
                const output: AccessionAlleles = {};
                accTGRC.forEach(acc => {
                    output[acc.accession] = {
                        gene: acc.alleles[0].gene,
                        allele: acc.alleles[0].allele
                    };
                });
                return output;
            })
        );
    }
}

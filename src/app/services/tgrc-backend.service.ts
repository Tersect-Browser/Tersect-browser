import { Injectable, Inject } from '@angular/core';
import { AppConfig, APP_CONFIG } from '../app.config';
import { HttpClient } from '@angular/common/http';
import { GeneTGRC } from '../../backend/db/genetgrc';
import { Observable, forkJoin } from 'rxjs';
import { AccessionTGRC } from '../../backend/db/accessiontgrc';
import { map } from 'rxjs/operators';

export interface AccessionAlleles {
    [tgrc_id: string]: {
        gene: string;
        allele: string;
    };
}

@Injectable()
export class TGRCBackendService {
    private apiUrl: string;

    constructor(private http: HttpClient,
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
            map(([all_genes, all_acc]) => {
                const gene_ids = new Set();
                all_acc.filter(acc => accessions.includes(acc.accession))
                       .forEach(acc => {
                    acc.alleles.forEach(allele => gene_ids.add(allele.gene));
                });
                return all_genes.filter(gene => gene_ids.has(gene.gene));
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

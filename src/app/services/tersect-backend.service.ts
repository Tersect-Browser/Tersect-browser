import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Inject, Injectable } from '@angular/core';

import { Observable, of } from 'rxjs';

import { DatasetPublic } from '../../backend/db/dataset';
import { PheneticTree } from '../../backend/db/phenetictree';
import { APP_CONFIG, AppConfig } from '../app.config';
import { BrowserSettings } from '../introgression-browser/browser-settings';
import { Chromosome } from '../models/Chromosome';
import { RefDistQuery } from '../models/RefDistQuery';
import { SequenceInterval } from '../models/SequenceInterval';
import { TreeQuery } from '../models/TreeQuery';
import { isNullOrUndefined } from '../utils/utils';

@Injectable()
export class TersectBackendService {
    private readonly apiUrl: string;

    constructor(private readonly http: HttpClient,
                @Inject(APP_CONFIG) config: AppConfig) {
        this.apiUrl = config.tbApiUrl;
    }

    /**
     * Retrieve binned genetic distances between each of the accessions in the
     * tersect database and a chosen 'reference' accession in a specified
     * chromosomal interval.
     *
     * @param datasetId dataset being used
     * @param reference reference accession id
     * @param chromosome chromosome of interest
     * @param start start position of the interval of interest
     * @param stop stop position of the interval of interest
     * @param binsize size of the bin (in base pairs)
     * @param accessions accessions included
     */
    getRefDistanceBins(datasetId: string, reference: string,
                       chromosome: string, start: number, stop: number,
                       binsize: number,
                       accessions: string[]): Observable<any[]> {
        const httpOptions = {
            headers: new HttpHeaders({ 'Content-Type': 'application/json' })
        };
        const query = `${this.apiUrl}/query/${datasetId}/dist`;
        const refDistQuery: RefDistQuery = {
            reference: reference,
            chromosome_name: chromosome,
            interval: [start, stop],
            binsize: binsize,
            accessions: accessions
        };
        return this.http.post<any>(query, refDistQuery, httpOptions);
    }

    /**
     * Retrieve a phenetic tree for a given list of accessions in a specific
     * dataset and chromosomal interval.
     *
     * @param datasetId dataset being used
     * @param chromosome chromosome of interest
     * @param start start position of the interval of interest
     * @param end end position of the interval of interest
     * @param accessions array of accessions to use
     */
    getPheneticTree(datasetId: string, chromosome: string,
                    start: number, end: number,
                    accessions: string[]): Observable<PheneticTree> {
        const httpOptions = {
            headers: new HttpHeaders({ 'Content-Type': 'application/json' })
        };
        const query = `${this.apiUrl}/query/${datasetId}/tree`;
        const treeQuery: TreeQuery = {
            chromosome_name: chromosome,
            interval: [start, end],
            accessions: accessions
        };
        return this.http.post<PheneticTree>(query, treeQuery, httpOptions);
    }

    /**
     * Retrieve list of accessions in a Tersect dataset.
     */
    getAccessionNames(datasetId: string): Observable<string[]> {
        const query = `${this.apiUrl}/query/${datasetId}/samples`;
        return this.http.get<string[]>(query);
    }

    getChromosomes(datasetId: string): Observable<Chromosome[]> {
        const query = `${this.apiUrl}/query/${datasetId}/chromosomes`;
        return this.http.get<Chromosome[]>(query);
    }

    /**
     * Retrieve list of gaps for a given chromosome.
     * @param datasetId dataset being used
     * @param chromosome chromosome of interest
     */
    getGapIndex(datasetId: string,
                chromosome: string): Observable<SequenceInterval[]> {
        const query = `${this.apiUrl}/query/${datasetId}/gaps/${chromosome}`;
        return this.http.get<SequenceInterval[]>(query);
    }

    getExportedSettings(exportId: string): Observable<BrowserSettings> {
        if (isNullOrUndefined(exportId)) {
            return of(undefined);
        } else {
            const query = `${this.apiUrl}/views/share/${exportId}`;
            return this.http.get<BrowserSettings>(query);
        }
    }

    getDatasets(): Observable<DatasetPublic[]> {
        const query = `${this.apiUrl}/datasets`;
        return this.http.get<DatasetPublic[]>(query);
    }

    exportSettings(settings: BrowserSettings): Observable<number> {
        const httpOptions = {
            headers: new HttpHeaders({ 'Content-Type': 'application/json' })
        };
        const query = `${this.apiUrl}/views/export`;
        return this.http.post<number>(query, settings, httpOptions);
    }
}

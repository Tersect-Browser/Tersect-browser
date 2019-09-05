import { Injectable, Inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable ,  of } from 'rxjs';
import { SequenceInterval } from '../models/SequenceInterval';
import { BrowserSettings } from '../introgression-browser/browser-settings';
import { isNullOrUndefined } from 'util';
import { Chromosome } from '../models/Chromosome';
import { IDatasetPublic } from '../../backend/db/dataset';
import { TreeQuery } from '../models/TreeQuery';
import { PheneticTree } from '../../backend/db/phenetictree';
import { RefDistQuery } from '../models/RefDistQuery';
import { APP_CONFIG, AppConfig } from '../app.config';

@Injectable()
export class TersectBackendService {

    private apiUrl: string;

    constructor(private http: HttpClient,
                @Inject(APP_CONFIG) config: AppConfig) {
        this.apiUrl = config.apiUrl;
    }

    /**
     * Retrieve binned genetic distances between each of the accessions in the
     * tersect database and a chosen 'reference' accession in a specified
     * chromosomal interval.
     *
     * @param dataset_id dataset being used
     * @param reference reference accession id
     * @param chromosome chromosome of interest
     * @param start start position of the interval of interest
     * @param stop stop position of the interval of interest
     * @param binsize size of the bin (in base pairs)
     * @param accessions accessions included
     */
    getRefDistanceBins(dataset_id: string, reference: string,
                       chromosome: string, start: number, stop: number,
                       binsize: number,
                       accessions: string[]): Observable<any[]> {
        const httpOptions = {
            headers: new HttpHeaders({ 'Content-Type': 'application/json' })
        };
        const query = `${this.apiUrl}/query/${dataset_id}/dist`;
        const ref_dist_query: RefDistQuery = {
            reference: reference,
            chromosome_name: chromosome,
            interval: [start, stop],
            binsize: binsize,
            accessions: accessions
        };
        return this.http.post<any>(query, ref_dist_query, httpOptions);
    }

    /**
     * Retrieve a phenetic tree for a given list of accessions in a specific
     * dataset and chromosomal interval.
     *
     * @param dataset_id dataset being used
     * @param chromosome chromosome of interest
     * @param start start position of the interval of interest
     * @param end end position of the interval of interest
     * @param accessions array of accessions to use
     */
    getPheneticTree(dataset_id: string, chromosome: string,
                    start: number, end: number,
                    accessions: string[]): Observable<PheneticTree> {
        const httpOptions = {
            headers: new HttpHeaders({ 'Content-Type': 'application/json' })
        };
        const query = `${this.apiUrl}/query/${dataset_id}/tree`;
        const tree_query: TreeQuery = {
            chromosome_name: chromosome,
            interval: [start, end],
            accessions: accessions,
        };
        return this.http.post<PheneticTree>(query, tree_query, httpOptions);
    }

    /**
     * Retrieve list of accessions in a Tersect dataset.
     */
    getAccessionNames(dataset_id: string): Observable<string[]> {
        const query = `${this.apiUrl}/query/${dataset_id}/samples`;
        return this.http.get<string[]>(query);
    }

    getChromosomes(dataset_id: string): Observable<Chromosome[]> {
        const query = `${this.apiUrl}/query/${dataset_id}/chromosomes`;
        return this.http.get<Chromosome[]>(query);
    }

    /**
     * Retrieve list of gaps for a given chromosome.
     * @param dataset_id dataset being used
     * @param chromosome chromosome of interest
     */
    getGapIndex(dataset_id: string,
                chromosome: string): Observable<SequenceInterval[]> {
        const query = `${this.apiUrl}/query/${dataset_id}/gaps/\
${chromosome}`;
        return this.http.get<SequenceInterval[]>(query);
    }

    getExportedSettings(export_id: string): Observable<BrowserSettings> {
        if (isNullOrUndefined(export_id)) {
            return of(undefined);
        } else {
            const query = `${this.apiUrl}/views/share/\
${export_id}`;
            return this.http.get<BrowserSettings>(query);
        }
    }

    getDatasets(): Observable<IDatasetPublic[]> {
        const query = `${this.apiUrl}/datasets`;
        return this.http.get<IDatasetPublic[]>(query);
    }

    exportSettings(settings: BrowserSettings): Observable<number> {
        const httpOptions = {
            headers: new HttpHeaders({ 'Content-Type': 'application/json' })
        };
        const query = `${this.apiUrl}/views/export`;
        return this.http.post<number>(query, settings, httpOptions);
    }

}

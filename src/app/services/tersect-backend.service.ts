import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs/Observable';
import { SequenceInterval } from '../models/SequenceInterval';
import { BrowserSettings } from '../introgression-browser/browser-settings';

import { of } from 'rxjs/observable/of';
import { isNullOrUndefined } from 'util';
import { Chromosome } from '../models/Chromosome';
import { IDatasetPublic } from '../../backend/db/dataset';
import { TreeQuery } from '../models/TreeQuery';
import { TreeNode } from '../clustering/clustering';
import { combineLatest } from 'rxjs/observable/combineLatest';

@Injectable()
export class TersectBackendService {

    constructor(private http: HttpClient) { }

    /**
     * Retrieve binned genetic distances between each of the accessions in the
     * tersect database and a chosen 'reference' accession in a specified
     * chromosomal interval.
     *
     * @param dataset_id dataset being used
     * @param accession reference accession filename
     * @param chromosome chromosome of interest
     * @param start start position of the interval of interest
     * @param stop stop position of the interval of interest
     * @param binsize size of the bin (in base pairs)
     */
    getRefDistanceBins(dataset_id: string, accession: string,
                       chromosome: string, start: number, stop: number,
                       binsize: number): Observable<any[]> {
        const query = `http://localhost:8060/tbapi/query/${dataset_id}/dist/\
${accession}/${chromosome}/${start}/${stop}/${binsize}`;
        return this.http.get<any>(query);
    }

    /**
     * Retrieve a phylogenetic tree for a given list of accessions in a specific
     * dataset and chromosomal interval.
     *
     * @param dataset_id dataset being used
     * @param chromosome chromosome of interest
     * @param start start position of the interval of interest
     * @param end end position of the interval of interest
     * @param accessions array of accessions to use
     */
    getPhylogeneticTree(dataset_id: string, chromosome: string,
                        start: number, end: number,
                        accessions: string[]): Observable<[TreeQuery,
                                                           TreeNode]> {
        const httpOptions = {
            headers: new HttpHeaders({ 'Content-Type': 'application/json' })
        };
        const query = `http://localhost:8060/tbapi/query/${dataset_id}/tree`;
        const tree_query: TreeQuery = {
            chromosome_name: chromosome,
            interval: [start, end],
            accessions: accessions,
        };
        return combineLatest(of(tree_query),
                             this.http.post<TreeNode>(query, tree_query,
                                                      httpOptions));
    }

    /**
     * Retrieve list of accessions in a Tersect dataset.
     */
    getAccessionNames(dataset_id: string): Observable<string[]> {
        const query = `http://localhost:8060/tbapi/query/${dataset_id}/samples`;
        return this.http.get<string[]>(query);
    }

    getChromosomes(dataset_id: string): Observable<Chromosome[]> {
        const query = `http://localhost:8060/tbapi/query/${dataset_id}/chromosomes`;
        return this.http.get<Chromosome[]>(query);
    }

    /**
     * Retrieve list of gaps for a given chromosome.
     * @param dataset_id dataset being used
     * @param chromosome chromosome of interest
     */
    getGapIndex(dataset_id: string,
                chromosome: string): Observable<SequenceInterval[]> {
        const query = `http://localhost:8060/tbapi/query/${dataset_id}/gaps/\
${chromosome}`;
        return this.http.get<SequenceInterval[]>(query);
    }

    getExportedSettings(export_id: string): Observable<BrowserSettings> {
        if (isNullOrUndefined(export_id)) {
            return of(undefined);
        } else {
            const query = `http://localhost:8060/tbapi/views/share/\
${export_id}`;
            return this.http.get<BrowserSettings>(query);
        }
    }

    getDatasets(): Observable<IDatasetPublic[]> {
        const query = 'http://localhost:8060/tbapi/datasets';
        return this.http.get<IDatasetPublic[]>(query);
    }

    exportSettings(settings: BrowserSettings): Observable<number> {
        const httpOptions = {
            headers: new HttpHeaders({ 'Content-Type': 'application/json' })
        };
        const query = `http://localhost:8060/tbapi/views/export`;
        return this.http.post<number>(query, settings, httpOptions);
    }

}

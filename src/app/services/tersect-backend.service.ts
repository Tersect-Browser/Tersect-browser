import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs/Observable';
import { DistanceMatrix } from '../models/DistanceMatrix';
import { SequenceInterval } from '../models/SequenceInterval';
import { BrowserSettings } from '../introgression-browser/browser-settings';

import { of } from 'rxjs/observable/of';
import { isNullOrUndefined } from 'util';
import { Chromosome } from '../models/Chromosome';

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
     * Retrieve a pairwise genetic distance matrix between each of the
     * accessions in the tersect database in a specified chromosomal region.
     *
     * @param dataset_id dataset being used
     * @param chromosome chromosome of interest
     * @param start start position of the interval of interest
     * @param stop stop position of the interval of interest
     */
    getDistanceMatrix(dataset_id: string, chromosome: string,
                      start: number, stop: number): Observable<DistanceMatrix> {
        const query = `http://localhost:8060/tbapi/query/${dataset_id}/distall/\
${chromosome}/${start}/${stop}`;
        return this.http.get<DistanceMatrix>(query);
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
            const query = `http://localhost:8060/tbapi/viewsettings/share/\
${export_id}`;
            return this.http.get<BrowserSettings>(query);
        }
    }

    exportSettings(settings: BrowserSettings): Observable<number> {
        const httpOptions = {
            headers: new HttpHeaders({ 'Content-Type': 'application/json' })
        };
        const query = `http://localhost:8060/tbapi/viewsettings/export`;
        return this.http.post<number>(query, settings, httpOptions);
    }

}

import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs/Observable';
import { DistanceMatrix } from '../models/DistanceMatrix';
import { SequenceInterval } from '../models/SequenceInterval';
import { BrowserSettings } from '../introgression-browser/browser-settings';

import { of } from 'rxjs/observable/of';
import { isNullOrUndefined } from 'util';

@Injectable()
export class TersectBackendService {

    constructor(private http: HttpClient) { }

    /**
     * Retrieve binned genetic distances between each of the accessions in the
     * tersect database and a chosen 'reference' accession in a specified
     * chromosomal interval.
     *
     * @param accession reference accession filename
     * @param chromosome chromosome of interest
     * @param start start position of the interval of interest
     * @param stop stop position of the interval of interest
     * @param binsize size of the bin (in base pairs)
     */
    getRefDistanceBins(accession: string, chromosome: string,
                       start: number, stop: number,
                       binsize: number): Observable<any[]> {
        const query = `http://localhost:8060/tbapi/dist/${accession}/\
${chromosome}/${start}/${stop}/${binsize}`;
        return this.http.get<any>(query);
    }

    /**
     * Retrieve a pairwise genetic distance matrix between each of the
     * accessions in the tersect database in a specified chromosomal region.
     *
     * @param chromosome chromosome of interest
     * @param start start position of the interval of interest
     * @param stop stop position of the interval of interest
     */
    getDistanceMatrix(chromosome: string,
                      start: number, stop: number): Observable<DistanceMatrix> {
        const query = `http://localhost:8060/tbapi/distall/\
${chromosome}/${start}/${stop}`;
        return this.http.get<DistanceMatrix>(query);
    }

    /**
     * Retrieve list of accessions in the Tersect database.
     */
    getAccessionNames(): Observable<string[]> {
        const query = `http://localhost:8060/tbapi/samples`;
        return this.http.get<string[]>(query);
    }

    /**
     * Retrieve list of gaps for a given chromosome.
     * @param chromosome chromosome of interest
     */
    getGapIndex(chromosome: string): Observable<SequenceInterval[]> {
        const query = `http://localhost:8060/tbapi/gaps/${chromosome}`;
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

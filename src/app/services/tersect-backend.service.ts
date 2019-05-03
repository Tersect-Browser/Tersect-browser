import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs/Observable';
import { DistanceMatrix } from '../models/DistanceMatrix';

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
        return this.http.get<any[]>(query);
    }

    /**
     * Retrieve a pairwise genetic distance matrix between each of the
     * accessions in the tersect database in a specified chromosomal region.
     *
     * @param chromosome chromosome of interst
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

}

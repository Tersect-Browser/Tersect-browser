import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Inject, Injectable } from '@angular/core';

import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';

import { DatasetPublic } from '../../../../backend/src/models/dataset';
import { NewickTree } from '../../../../backend/src/models/newicktree';
import { DistanceBinQuery, DistanceBins } from '../../../../common/DistanceBins';
import { TreeQuery } from '../../../../common/PheneticTree';
import { APP_CONFIG, AppConfig } from '../app.config';
import { Chromosome } from '../models/Chromosome';
import { SequenceInterval } from '../models/SequenceInterval';
import { BrowserSettings } from '../pages/tersect-browser/models/BrowserSettings';
import { isNullOrUndefined, snvCountToJC } from '../utils/utils';

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
     * @param end end position of the interval of interest
     * @param binsize size of the bin (in base pairs)
     * @param accessions accessions included
     */
    getDistanceBins(datasetId: string, reference: string,
                    chromosome: string, start: number, end: number,
                    binsize: number, accessions: string[]): Observable<DistanceBins> {
        const httpOptions = {
            headers: new HttpHeaders({ 'Content-Type': 'application/json' })
        };
        const query = `${this.apiUrl}/query/${datasetId}/dist`;
        const distBinQuery: DistanceBinQuery = {
            reference: reference,
            chromosome_name: chromosome,
            interval: [start, end],
            binsize: binsize,
            accessions: accessions
        };
        return this.http.post<DistanceBins>(query, distBinQuery, httpOptions)
                        .pipe(
            tap(distBins => {
                for (const accId of Object.keys(distBins.bins)) {
                    distBins.bins[accId] = distBins.bins[accId].map(
                        dist => snvCountToJC(dist, binsize)
                    );
                }
            })
        )
    }

    /**
     * Retrieve a Newick-formatted phenetic tree for a given list of accessions
     * in a specific dataset and chromosomal interval.
     *
     * @param datasetId dataset being used
     * @param chromosome chromosome of interest
     * @param start start position of the interval of interest
     * @param end end position of the interval of interest
     * @param accessions array of accessions to use
     */
    getNewickTree(datasetId: string, chromosome: string,
                    start: number, end: number,
                    accessions: string[]): Observable<NewickTree> {
        const httpOptions = {
            headers: new HttpHeaders({ 'Content-Type': 'application/json' })
        };
        const query = `${this.apiUrl}/query/${datasetId}/tree`;
        const treeQuery: TreeQuery = {
            chromosomeName: chromosome,
            interval: [start, end],
            accessions: accessions
        };
        return this.http.post<NewickTree>(query, treeQuery, httpOptions);
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
    getChromosomeGaps(datasetId: string,
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

    exportSettings(settings: BrowserSettings): Observable<string> {
        const httpOptions = {
            headers: new HttpHeaders({ 'Content-Type': 'application/json' })
        };
        const query = `${this.apiUrl}/views/export`;
        return this.http.post<string>(query, settings, httpOptions);
    }

    // generateBarcodes(
    //     accessionName: string,
    //     chrom: string,
    //     start: number,
    //     end: number,
    //     size: number
    //   ): Observable<Blob> {
    //     const payload = { accessionName, chrom, start, end, size };
    //     const headers = new HttpHeaders({ 'Content-Type': 'application/json' });
      
    //     return this.http.post(`${this.apiUrl}/generate-barcodes`, payload, {
    //       headers,
    //       responseType: 'blob' // Important for file download
    //     });
    //   }
    generateBarcodes(accessionName: string, chrom: string, start: number, end: number, size: number, maxVar: number | null): Observable<{ downloadableURL: string }> {
        // return this.http.post<{ downloadableURL: string }>(
        //   '/generate-barcodes',
        //   { accessionName, chrom, start, end, size } // body payload
        // );
        const payload = { accessionName, chrom, start, end, size, maxVar };
        const headers = new HttpHeaders({ 'Content-Type': 'application/json' });
      
        // return this.http.post(`${this.apiUrl}/generate-barcodes`, payload, {
        //   headers,
        //   responseType: 'json' // Important for file download
        // }) as unknown as Observable<{ downloadableURL: string }>;
        return this.http.post<{ downloadableURL: string }>(
            `${this.apiUrl}/generate-barcodes`, 
            payload, 
            { headers, responseType: 'json' }
        );
      }
}

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs/Observable';

@Injectable()
export class TersectBackendService {

  constructor(private http: HttpClient) { }

  getDistances(accession: string, chromosome: string,
               start: number, stop: number, binsize: number): Observable<any[]> {
    const query = `http://localhost:8040/api/distances/${accession}/\
${chromosome}/${start}/${stop}/${binsize}`;
    console.log(query);
    return this.http.get<any[]>(query);
  }

}

import { Injectable, Inject } from '@angular/core';
import { AppConfig, APP_CONFIG } from '../app.config';
import { HttpClient } from '@angular/common/http';
import { GeneTGRC } from '../../backend/db/genestgrc';
import { Observable } from 'rxjs';

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
}

import { TersectBackendService } from '../services/tersect-backend.service';
import { DatasetPublic } from '../../backend/db/dataset';

import { Component, OnInit } from '@angular/core';

@Component({
    selector: 'app-intro-page',
    templateUrl: './intro-page.component.html',
    styleUrls: ['./intro-page.component.css']
})
export class IntroPageComponent implements OnInit {
    constructor(private readonly tersectBackendService: TersectBackendService) {
    }

    datasets: DatasetPublic[];

    ngOnInit() {
        this.tersectBackendService.getDatasets().subscribe(ds => {
            this.datasets = ds;
        });
    }
}

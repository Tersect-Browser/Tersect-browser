import { Component, OnInit } from '@angular/core';

import { DatasetPublic } from '../../backend/models/dataset';
import { TersectBackendService } from '../services/tersect-backend.service';

@Component({
    selector: 'app-intro-page',
    templateUrl: './intro-page.component.html',
    styleUrls: ['./intro-page.component.css']
})
export class IntroPageComponent implements OnInit {
    datasets: DatasetPublic[];

    constructor(private readonly tersectBackendService: TersectBackendService) {
    }

    ngOnInit() {
        this.tersectBackendService.getDatasets().subscribe(ds => {
            this.datasets = ds;
        });
    }
}

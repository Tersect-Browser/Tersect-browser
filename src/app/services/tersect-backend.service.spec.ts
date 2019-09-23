import { inject, TestBed } from '@angular/core/testing';

import { TersectBackendService } from './tersect-backend.service';

describe('TersectBackendService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [TersectBackendService]
    });
  });

  it('should be created', inject([TersectBackendService], (service: TersectBackendService) => {
    expect(service).toBeTruthy();
  }));
});

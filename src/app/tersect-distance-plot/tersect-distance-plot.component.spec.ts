import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { TersectDistancePlotComponent } from './tersect-distance-plot.component';

describe('TersectDistancePlotComponent', () => {
  let component: TersectDistancePlotComponent;
  let fixture: ComponentFixture<TersectDistancePlotComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ TersectDistancePlotComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(TersectDistancePlotComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

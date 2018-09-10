import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { IntrogressionPlotComponent } from './introgression-plot.component';

describe('IntrogressionPlotComponent', () => {
  let component: IntrogressionPlotComponent;
  let fixture: ComponentFixture<IntrogressionPlotComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ IntrogressionPlotComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(IntrogressionPlotComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

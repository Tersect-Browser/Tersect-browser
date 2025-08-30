import { ComponentFixture, TestBed } from '@angular/core/testing';

import { IntrogressionVisualizerComponent } from './introgression-visualizer.component';

describe('IntrogressionVisualizerComponent', () => {
  let component: IntrogressionVisualizerComponent;
  let fixture: ComponentFixture<IntrogressionVisualizerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [IntrogressionVisualizerComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(IntrogressionVisualizerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

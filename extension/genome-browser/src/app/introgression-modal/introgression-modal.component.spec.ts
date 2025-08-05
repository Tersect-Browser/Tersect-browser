import { ComponentFixture, TestBed } from '@angular/core/testing';

import { IntrogressionModalComponent } from './introgression-modal.component';

describe('IntrogressionModalComponent', () => {
  let component: IntrogressionModalComponent;
  let fixture: ComponentFixture<IntrogressionModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [IntrogressionModalComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(IntrogressionModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

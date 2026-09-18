import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NightPhase } from './night-phase';

describe('NightPhase', () => {
  let component: NightPhase;
  let fixture: ComponentFixture<NightPhase>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NightPhase]
    })
    .compileComponents();

    fixture = TestBed.createComponent(NightPhase);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Deliverables } from './deliverables';

describe('Deliverables', () => {
  let component: Deliverables;
  let fixture: ComponentFixture<Deliverables>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Deliverables]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Deliverables);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

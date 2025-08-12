import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CreateShare } from './create-share';

describe('CreateShare', () => {
  let component: CreateShare;
  let fixture: ComponentFixture<CreateShare>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CreateShare]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CreateShare);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

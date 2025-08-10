import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SelectionBasket } from './selection-basket';

describe('SelectionBasket', () => {
  let component: SelectionBasket;
  let fixture: ComponentFixture<SelectionBasket>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SelectionBasket]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SelectionBasket);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

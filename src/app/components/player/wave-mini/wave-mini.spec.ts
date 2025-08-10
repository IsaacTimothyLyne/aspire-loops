import { ComponentFixture, TestBed } from '@angular/core/testing';

import { WaveMini } from './wave-mini';

describe('WaveMini', () => {
  let component: WaveMini;
  let fixture: ComponentFixture<WaveMini>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WaveMini]
    })
    .compileComponents();

    fixture = TestBed.createComponent(WaveMini);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

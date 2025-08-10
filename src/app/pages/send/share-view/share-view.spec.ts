import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ShareView } from './share-view';

describe('ShareView', () => {
  let component: ShareView;
  let fixture: ComponentFixture<ShareView>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ShareView]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ShareView);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

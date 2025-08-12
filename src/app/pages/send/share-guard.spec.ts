import { TestBed } from '@angular/core/testing';
import { CanActivateFn } from '@angular/router';

import { shareGuard } from './share-guard';

describe('shareGuard', () => {
  const executeGuard: CanActivateFn = (...guardParameters) => 
      TestBed.runInInjectionContext(() => shareGuard(...guardParameters));

  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('should be created', () => {
    expect(executeGuard).toBeTruthy();
  });
});

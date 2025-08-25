import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { Auth, onAuthStateChanged, User } from '@angular/fire/auth';

function waitForUser(auth: Auth): Promise<User | null> {
  return new Promise((resolve) => {
    const off = onAuthStateChanged(auth, (u) => { off(); resolve(u ?? null); }, () => { off(); resolve(null); });
  });
}

export const authGuard: CanActivateFn = async (): Promise<boolean | UrlTree> => {
  const auth = inject(Auth);
  const router = inject(Router);
  const user = await waitForUser(auth);
  return user ? true : router.parseUrl('/auth');
};

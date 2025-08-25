import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { Auth, onAuthStateChanged, User, reload } from '@angular/fire/auth';

function waitForUser(auth: Auth): Promise<User | null> {
  return new Promise((resolve) => {
    const off = onAuthStateChanged(auth, (u) => { off(); resolve(u ?? null); }, () => { off(); resolve(null); });
  });
}

export const VerifiedGuard: CanActivateFn = async (): Promise<boolean | UrlTree> => {
  const auth = inject(Auth);
  const router = inject(Router);

  const user = await waitForUser(auth);
  if (!user) return router.parseUrl('/auth');

  // optional: refresh once to pick up a just-verified state
  try { await reload(user); } catch {}

  return user.emailVerified ? true : router.parseUrl('/verify');
};

import { Injectable, inject } from '@angular/core';
import {
  Auth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  browserLocalPersistence,
  browserSessionPersistence,
  setPersistence,
  sendEmailVerification, reload,
  User
} from '@angular/fire/auth';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private auth = inject(Auth);
  /** Current user stream */
  user$ = new BehaviorSubject<User | null>(null);
  /** Whether we’re doing an auth call */
  loading$ = new BehaviorSubject<boolean>(false);

  constructor() {
    // default: remember me (persist across tabs)
    setPersistence(this.auth, browserLocalPersistence);
    onAuthStateChanged(this.auth, (u) => this.user$.next(u));
  }

  /** Switch persistence based on Remember Me toggle */
  async setRemember(remember: boolean) {
    await setPersistence(this.auth, remember ? browserLocalPersistence : browserSessionPersistence);
  }
  async resendVerification() {
    const u = this.user$.value;
    if (u) await sendEmailVerification(u);
  }

  async refreshUser() {
    const u = this.user$.value;
    if (u) { await reload(u); this.user$.next(u); }
  }
  async signUp(email: string, password: string) {
    this.loading$.next(true);
    try {
      const cred = await createUserWithEmailAndPassword(this.auth, email, password);
      // send verification but don't block UI on errors
      try { await sendEmailVerification(cred.user); } catch {}
      return cred.user;
    } finally {
      this.loading$.next(false);
    }
  }

  async signIn(email: string, password: string) {
    this.loading$.next(true);
    try {
      const cred = await signInWithEmailAndPassword(this.auth, email, password);
      return cred.user;
    } finally {
      this.loading$.next(false);
    }
  }

  reset(email: string) {
    return sendPasswordResetEmail(this.auth, email);
  }

  logout() {
    return signOut(this.auth);
  }
}

/** Map Firebase auth codes to friendly copy */
export const AUTH_ERROR_COPY: Record<string, string> = {
  'auth/invalid-credential': 'Wrong email or password.',
  'auth/invalid-email': 'That email address looks invalid.',
  'auth/user-disabled': 'This account is disabled.',
  'auth/user-not-found': 'No account with that email.',
  'auth/wrong-password': 'Wrong email or password.',
  'auth/too-many-requests': 'Too many attempts. Try again later.',
};

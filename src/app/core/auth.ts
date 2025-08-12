import {inject, Injectable} from '@angular/core';
import {
  isSignInWithEmailLink,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  signInWithEmailLink,
  signInWithPopup,
  Auth
} from '@angular/fire/auth';
import firebase from 'firebase/compat';
import User = firebase.User;
import GoogleAuthProvider = firebase.auth.GoogleAuthProvider;

@Injectable({
  providedIn: 'root'
})
export class AuthService {

  private auth = inject(Auth);
  user$ = new Promise<User|null>(res => onAuthStateChanged(this.auth, res => console.log(res)));

  google() { return signInWithPopup(this.auth, new GoogleAuthProvider()); }

  async emailLink(email: string) {
    await sendSignInLinkToEmail(this.auth, email, {
      url: window.location.origin,
      handleCodeInApp: true,
    });
    localStorage.setItem('emailForSignIn', email);
  }

  async completeEmailLink() {
    if (isSignInWithEmailLink(this.auth, window.location.href)) {
      const email = localStorage.getItem('emailForSignIn')!;
      await signInWithEmailLink(this.auth, email, window.location.href);
    }
  }
}

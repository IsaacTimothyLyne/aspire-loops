import {Component, inject, signal} from '@angular/core';
import {AuthService} from '../../core/auth';
import {Router} from '@angular/router';
import {NgIf} from '@angular/common';

@Component({
  selector: 'app-verify',
  imports: [
    NgIf
  ],
  templateUrl: './verify.html',
  styleUrl: './verify.scss'
})
export class Verify {
  private auth = inject(AuthService);
  private router = inject(Router);

  email = signal(this.auth.user$.value?.email || '');
  msg = signal('');
  busy = signal(false);

  async resend(){
    this.busy.set(true);
    try { await this.auth.resendVerification(); this.msg.set('Verification email sent.'); }
    finally { this.busy.set(false); }
  }
  async check(){
    this.busy.set(true);
    try {
      await this.auth.refreshUser();
      if (this.auth.user$.value?.emailVerified) {
        this.router.navigateByUrl('/make');
      } else {
        this.msg.set('Not verified yet—try again after clicking the email link.');
      }
    } finally { this.busy.set(false); }
  }
}

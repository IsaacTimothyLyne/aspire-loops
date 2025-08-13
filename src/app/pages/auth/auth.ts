import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService, AUTH_ERROR_COPY } from '../../core/auth';

function match(other: () => AbstractControl | null) {
  return (ctrl: AbstractControl): ValidationErrors | null =>
    !other() ? null : (ctrl.value === other()!.value ? null : { mismatch: true });
}

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './auth.html',
  styleUrls: ['./auth.scss']
})
export class Auth {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);

  mode = signal<'login' | 'signup'>('login');
  showPw = signal(false);
  remember = signal(true);
  err = signal('');
  info = signal(''); // e.g., "Check your email to verify"
  loading = signal(false);

  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    confirm: [''] // only used in signup
  });

  // enable confirm validator only in signup
  confirmCtrl = computed(() => this.form.get('confirm'));
  ngOnInit() {
    this.form.get('confirm')?.addValidators([
      () => this.mode() === 'signup' ? Validators.required(this.form.get('confirm')!) : null,
      match(() => this.form.get('password'))
    ]);
  }

  toggleMode() {
    this.mode.update(m => m === 'login' ? 'signup' : 'login');
    this.err.set(''); this.info.set('');
    // revalidate confirm on mode switch
    setTimeout(() => this.form.get('confirm')?.updateValueAndValidity());
  }

  toggleShow() { this.showPw.update(v => !v); }

  async submit() {
    this.err.set(''); this.info.set('');
    if (this.form.invalid) {
      this.err.set('Enter a valid email and a password (6+ chars).');
      return;
    }
    this.loading.set(true);
    try {
      await this.auth.setRemember(this.remember());
      const { email, password, confirm } = this.form.value as any;

      if (this.mode() === 'login') {
        const user = await this.auth.signIn(email, password);
        // Optional: show nudge if not verified
        if (user && !user.emailVerified) this.info.set('Signed in. Please verify your email for full access.');
        await this.router.navigateByUrl('/make');
      } else {
        await this.auth.signUp(email, password);
        this.info.set('Account created. We sent a verification email — check your inbox.');
        await this.router.navigateByUrl('/make'); // or keep them here; your call
      }
    } catch (e: any) {
      const code = e?.code as string;
      this.err.set(AUTH_ERROR_COPY[code] || e?.message || 'Something went wrong.');
    } finally {
      this.loading.set(false);
    }
  }

  async reset() {
    this.err.set(''); this.info.set('');
    const email = this.form.value.email as string;
    if (!email) { this.err.set('Enter your email first.'); return; }
    try {
      await this.auth.reset(email);
      this.info.set('Password reset email sent.');
    } catch (e: any) {
      const code = e?.code as string;
      this.err.set(AUTH_ERROR_COPY[code] || e?.message || 'Could not send reset email.');
    }
  }
}

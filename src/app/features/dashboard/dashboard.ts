import { Component, HostListener, ViewChild, ElementRef, inject, signal, computed, effect, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Db } from '@core/firebase/db';
import { AuthService } from '@core/auth/auth';
import { Pack } from '@core/models/models';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './dashboard.html',
  styleUrls: ['./dashboard.scss'],
})
export class Dashboard {
  private db = inject(Db);
  private auth = inject(AuthService);
  private destroyRef = inject(DestroyRef);

  @ViewChild('searchBox', { static: true }) searchBox!: ElementRef<HTMLInputElement>;

  userEmail = signal('');
  loading = signal(true);

  // raw list from Firestore
  allPacks = signal<Pack[]>([]);

  // search & filter state
  q = signal('');
  private debouncedQ = signal('');
  filter = signal<'all' | 'private' | 'public'>('all');

  // number of skeletons to render responsively
  readonly SKELETONS = Array.from({ length: 6 }, (_, i) => i);

  constructor() {
    // Debounce search input (150ms)
    let t: any;
    effect(() => {
      const val = this.q();
      clearTimeout(t);
      t = setTimeout(() => this.debouncedQ.set(val.trim().toLowerCase()), 150);
    });

    // Load packs for the signed-in user
    const user = this.auth.user$.value;
    if (user) {
      this.userEmail.set(user.email || '');
      this.db.myPacksStream(user.uid, 50)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((list: Pack[]) => {
          this.allPacks.set(Array.isArray(list) ? list : []);
          this.loading.set(false);
        });
    } else {
      this.loading.set(false);
    }
  }

  // Derived, filtered list
  packs = computed<Pack[]>(() => {
    const list = this.allPacks();
    const f = this.filter();
    const q = this.debouncedQ();

    let arr = f === 'all'
      ? list
      : list.filter(p => !!p.isPublic === (f === 'public'));

    if (q) {
      arr = arr.filter(p => {
        const title = (p.title || '').toLowerCase();
        const inTitle = title.includes(q);

        const inTags = (p.tags || []).some(t => (t || '').toLowerCase().includes(q));
        const inKeys = (p.keys || []).some(k => (k || '').toLowerCase().includes(q));

        const inBpm =
          (p as any).bpmMin?.toString().includes(q) ||
          (p as any).bpmMax?.toString().includes(q);

        return inTitle || inTags || inKeys || !!inBpm;
      });
    }

    return arr;
  });

  // UI handlers
  onInput(v: string) { this.q.set(v); }
  setFilter(f: 'all' | 'private' | 'public') { this.filter.set(f); }

  coverFor(title: string) {
    const safe = title || 'x';
    const h = Array.from(safe).reduce((a, c) => a + c.charCodeAt(0), 0);
    const a = (h * 29) % 360, b = (h * 53) % 360, c = (h * 83) % 360;
    return `linear-gradient(135deg, hsl(${a} 70% 55%), hsl(${b} 70% 55%) 60%, hsl(${c} 70% 55%))`;
    // optionally: add background-image with subtle noise for texture
  }

  share() { /* wire up later */ }

  // Keyboard shortcuts: "/" focus search, "n" new, "u" upload
  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    // focus search
    if (e.key === '/') {
      e.preventDefault();
      this.searchBox?.nativeElement?.focus();
      this.searchBox?.nativeElement?.select();
    }
    // quick nav
    if (e.key.toLowerCase() === 'n') { e.preventDefault(); (window as any).ng?.router?.navigate?.(['/pack/new']); }
    if (e.key.toLowerCase() === 'u') { e.preventDefault(); (window as any).ng?.router?.navigate?.(['/upload']); }
  }
}

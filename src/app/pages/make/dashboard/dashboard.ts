import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {Db} from '../../../core/db';
import { AuthService } from '../../../core/auth';
import { Subscription } from 'rxjs';
import {Pack} from '../../../core/models'

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './dashboard.html',
  styleUrls: ['./dashboard.scss']
})
export class Dashboard {
  private db = inject(Db);
  private auth = inject(AuthService);

  private sub?: Subscription;

  userEmail = signal('');
  loading = signal(true);
  allPacks = signal<any[]>([]);
  packs = signal<any[]>([]);

  q = '';
  filter: 'all'|'private'|'public' = 'all';

  ngOnInit() {
    const user = this.auth.user$.value;
    if (!user) return;
    this.userEmail.set(user.email || '');

    this.loading.set(true);
    this.sub = this.db.myPacksStream(user.uid, 50).subscribe((list: Pack[]) => {
      this.allPacks.set(list || []);  // ✅ keep the raw list
      this.applyFilters();            // ✅ derive packs() from allPacks()
      this.loading.set(false);
    });
  }

  onSearch(){ this.applyFilters(); }
  setFilter(f: 'all'|'private'|'public'){ this.filter = f; this.applyFilters(); }

  applyFilters() {
    const q = this.q.trim().toLowerCase();
    let arr = [...this.allPacks()];
    if (this.filter !== 'all') arr = arr.filter(p => !!p.isPublic === (this.filter === 'public'));
    if (q) arr = arr.filter(p =>
      (p.title || '').toLowerCase().includes(q) ||
      (p.tags || []).some((t:string)=>t.toLowerCase().includes(q)) ||
      (p.keys || []).some((k:string)=>k.toLowerCase().includes(q))
    );
    this.packs.set(arr);
  }

  coverFor(title: string) {
    const h = Array.from(title || 'x').reduce((a,c)=>a+c.charCodeAt(0),0);
    const a = (h*29)%360, b = (h*53)%360, c = (h*83)%360;
    return `linear-gradient(135deg, hsl(${a} 70% 55%), hsl(${b} 70% 55%) 60%, hsl(${c} 70% 55%))`;
  }

  upload(){ /* routerLink in template is fine; keep stub if needed */ }
  share(){ /* later */ }

}

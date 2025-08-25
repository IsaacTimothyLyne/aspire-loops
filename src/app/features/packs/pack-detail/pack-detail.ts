// src/app/features/packs/pack-detail/pack-detail.ts
import { Component, ElementRef, ViewChild, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import {ActivatedRoute, Router} from '@angular/router';
import { Db } from '@core/firebase/db';
import {AudioPlayer, Track} from '@core/audio/audio-player';
import { Shares } from '@core/firebase/shares';

@Component({
  standalone: true,
  selector: 'app-pack-detail',
  imports: [CommonModule],
  templateUrl: './pack-detail.html',
  styleUrls: ['./pack-detail.scss']
})
export class PackDetail {
  private route = inject(ActivatedRoute);
  private db = inject(Db);
  private player = inject(AudioPlayer);
  private shares = inject(Shares);

  pack = signal<any | null>(null);
  items = signal<any[]>([]);
  loading = signal(true);
  sharing = signal(false);
  shareLink = signal<string | null>(null);
  tracks = signal<Track[]>([]);
  coverFor(title: string) {
    const s = title || 'x';
    const h = Array.from(s).reduce((a, c) => a + c.charCodeAt(0), 0);
    const a = (h * 29) % 360, b = (h * 53) % 360;
    return `linear-gradient(135deg, hsl(${a} 70% 50%), hsl(${b} 70% 52%))`;
  }

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id')!;

    this.db.itemsStream(id).subscribe(async list => {
      this.items.set(list || []);
      await this.hydrateQueue();             // ← build queue whenever items change
    });

    const p = await this.db.getPack(id);
    this.pack.set(p);
    this.loading.set(false);
    await this.hydrateQueue();               // also after pack arrives
  }

  deleting = signal(false);                    // ← add
  private router = inject(Router);
  async deletePack() {
    const p = this.pack(); if (!p || this.deleting()) return;

    const ok = confirm(`Delete “${p.title || 'Untitled pack'}”? Files in your library will NOT be deleted.`);
    if (!ok) return;

    this.deleting.set(true);
    try {
      // stop playback if currently playing an item from this pack
      const ids = new Set(this.items().map(x => x.id));
      const cur = this.player.current();
      if (cur?.id && ids.has(cur.id)) this.player.stop();

      await this.db.deletePack(p.id);
      await this.router.navigate(['/app/dashboard']);
    } catch (e) {
      console.error('Failed to delete pack', e);
      alert('Failed to delete pack. See console for details.');
    } finally {
      this.deleting.set(false);
    }
  }
  private async hydrateQueue() {
    const p = this.pack();
    const list = this.items();
    if (!p || !list?.length) return;

    const trks: Track[] = [];
    for (const it of list) {
      const f = await this.db.getFile(p.ownerUid, it.id);
      if (!f) continue;
      const url = await this.db.urlForFile(f);
      const peaks = Array.isArray(f.peaks)
        ? (Array.isArray((f.peaks as any)[0]) ? (f.peaks as any)[0] : (f.peaks as any))
        : undefined;

      trks.push({
        id: f.id,
        src: url,
        title: f.title || f.name || it.name,
        duration: f.duration ?? undefined,
        peaks,               // mono array; AudioPlayer wraps to AoC
        mime: f.contentType || undefined,
      });
    }

    this.tracks.set(trks);
    if (trks.length) await this.player.setQueue(trks, 0);  // ← enables next/prev
  }
  titleOf = (it: any) => it.name || 'Untitled';

  // inside PackDetail
  async play(it: any) {
    const idx = this.items().findIndex(x => x.id === it.id);
    if (idx >= 0 && this.tracks().length) {
      this.player.playIndex(idx);
      return;
    }
    // fallback (rare)
    const p = this.pack(); if (!p) return;
    const f = await this.db.getFile(p.ownerUid, it.id);
    if (!f) return;
    const url = await this.db.urlForFile(f);
    const peaks = Array.isArray(f.peaks) ? (Array.isArray((f.peaks as any)[0]) ? (f.peaks as any)[0] : (f.peaks as any)) : undefined;
    await this.player.setTrack({ id: f.id, src: url, title: f.title || f.name, duration: f.duration, peaks });
    this.player.play();
  }


  // inside PackDetail (you already added createShare)
  async createShare() {
    const p = this.pack(); if (!p) return;
    this.sharing.set(true);
    try {
      const s = await this.shares.createPackShare({ id: p.id, ownerUid: p.ownerUid, title: p.title });
      this.shareLink.set(`${location.origin}/s/${s.id}`);   // <-- shows copy/open right away
    } finally { this.sharing.set(false); }
  }



  isCurrent = (it: any) => this.player.current()?.id === it.id && this.player.isPlaying();
  protected readonly navigator = navigator;
}

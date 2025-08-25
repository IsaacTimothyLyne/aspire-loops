import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { Storage, ref as sref, getDownloadURL } from '@angular/fire/storage';
import { Shares, ShareDoc } from '@app/core/firebase/shares';
import { AudioPlayer, Track } from '@app/core/audio/audio-player';
import { firstValueFrom } from 'rxjs';
import {BottomPlayer} from '@shared/ui/bottom-player/bottom-player';

@Component({
  standalone: true,
  selector: 'app-share-page',
  imports: [CommonModule, RouterLink, BottomPlayer],
  templateUrl: './share-page.html',
  styleUrls: ['./share-page.scss'],
})
export class SharePage {
  private route   = inject(ActivatedRoute);
  private shares  = inject(Shares);
  private storage = inject(Storage);
  private title   = inject(Title);
  private meta    = inject(Meta);
  private player  = inject(AudioPlayer);

  loading = signal(true);

  share = signal<ShareDoc | null>(null);
  tracks = signal<Track[]>([]);

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.shares.share$(id).subscribe(async (s) => {
      this.share.set(s ?? null);
      if (!s) {
        this.tracks.set([]);
        this.loading.set(false);
        return;
      }

      // Meta
      this.title.setTitle(`${s.title} • Aspire`);
      this.meta.updateTag({property: 'og:title', content: s.title});
      this.meta.updateTag({property: 'og:type', content: s.kind === 'pack' ? 'music.playlist' : 'music.song'});
      this.meta.updateTag({property: 'og:url', content: location.href});

      // Build queue
      const items = await this.buildTracks(s);
      this.tracks.set(items);

      if (items.length) await this.player.setQueue(items, 0); // no autoplay
      this.loading.set(false);
    });
  }
  private async toHttps(pathOrUrl?: string | null): Promise<string | null> {
    if (!pathOrUrl) return null;
    if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
    try { return await getDownloadURL(sref(this.storage, pathOrUrl)); }
    catch { return null; }
  }

  private async buildTracks(s: ShareDoc): Promise<Track[]> {
    if (s.kind === 'file') {
      const url = await this.toHttps(s.previewReady && s.previewPath ? s.previewPath : s.url);
      return url ? [{
        id: s.id,
        src: url,
        title: s.title,
        mime: s.mime || 'audio/mpeg',
        duration: s.duration ?? undefined,
        peaks: s.peaks ?? undefined,
      }] : [];
    }

    // pack
    const out: Track[] = [];
    const peaksMap = (s as any).peaksById || {};
    for (const it of (s.items || [])) {
      const url = await this.toHttps((it as any).previewReady && (it as any).previewPath ? (it as any).previewPath : it.url);
      if (!url) continue;
      out.push({
        id: it.id,
        src: url,
        title: it.title,
        mime: it.mime || 'audio/mpeg',
        duration: it.duration ?? undefined,
        peaks: peaksMap[it.id] ?? undefined,  // ← pull from map
      });
    }
    return out;
  }

  playIndex(i: number) { this.player.playIndex(i); }
  toggle()             { this.player.toggle(); }

  coverFor(title: string) {
    const h = Array.from(title || 'x').reduce((a, c) => a + c.charCodeAt(0), 0);
    const a = (h * 29) % 360, b = (h * 53) % 360;
    return `linear-gradient(135deg, hsl(${a} 70% 55%), hsl(${b} 70% 55%))`;
  }

  async playItem(i: number) {
    const s = this.share(); if (!s || s.kind !== 'pack' || !s.items?.[i]) return;
    const t = s.items[i];
    await this.player.setTrack({ id: t.id, src: t.url, title: t.title, duration: t.duration, peaks: t.peaks as any });
    await this.player.play();
  }
}

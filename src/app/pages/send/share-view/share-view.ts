import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Firestore, doc, getDoc, collection, getDocs } from '@angular/fire/firestore';
import { getStorage, ref, getDownloadURL } from '@angular/fire/storage';
import {NgForOf} from '@angular/common';

@Component({
  standalone: true,
  imports: [
    NgForOf
  ],
  template: `
    <header>
      <h1>{{ title() }}</h1>
      <button (click)="downloadAll()">Download All</button>
    </header>

    <ul>
      <li *ngFor="let it of items()">
        <button (click)="play(it)">▶</button>
        {{ it.name }} · {{ it.bpm || '—' }} BPM · {{ it.key || '—' }}
        <button (click)="toggle(it)">{{ selectedIds().has(it.id) ? 'Selected' : 'Select' }}</button>
      </li>
    </ul>

    <footer>
      <button (click)="downloadSelected()" [disabled]="selectedIds().size===0">
        Download Selected ({{ selectedIds().size }})
      </button>
      <audio #player controls style="width:100%"></audio>
    </footer>
  `
})
export class ShareView implements OnInit {
  private route = inject(ActivatedRoute);
  private fs = inject(Firestore);
  private storage = getStorage();

  title = signal('Pack');
  items = signal<any[]>([]);
  selectedIds = signal<Set<string>>(new Set());
  audio?: HTMLAudioElement;

  async ngOnInit() {
    const shareId = this.route.snapshot.paramMap.get('shareId')!;
    const share = (await getDoc(doc(this.fs, 'shareLinks', shareId))).data() as any;
    const pack = (await getDoc(doc(this.fs, 'packs', share.packId))).data() as any;
    this.title.set(pack.title);

    const col = collection(this.fs, `packs/${share.packId}/items`);
    const snaps = await getDocs(col);
    this.items.set(await Promise.all(snaps.docs.map(async d => {
      const it = { id: d.id, ...d.data() } as any;
      it.url = await getDownloadURL(ref(this.storage, it.storagePath));
      return it;
    })));
  }

  play(it: any) {
    if (!this.audio) this.audio = document.querySelector('audio')!;
    this.audio.src = it.url; this.audio.play();
  }

  toggle(it: any) {
    const s = new Set(this.selectedIds());
    s.has(it.id) ? s.delete(it.id) : s.add(it.id);
    this.selectedIds.set(s);
  }

  async downloadAll() { await this.download(this.items()); }
  async downloadSelected() {
    const sel = this.items().filter(i => this.selectedIds().has(i.id));
    await this.download(sel);
  }

  private async download(files: any[]) {
    // Simple: open each URL in a new tab (zip comes later)
    files.forEach(f => window.open(f.url, '_blank'));
  }
}

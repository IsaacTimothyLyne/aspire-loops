// src/app/features/packs/pack-new/pack-new.ts
import {Component, inject, signal, computed} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {DragDropModule, CdkDragDrop, moveItemInArray, CdkDrag, CdkDropList} from '@angular/cdk/drag-drop';
import {Router} from '@angular/router';
import {Auth} from '@angular/fire/auth';
import {Db} from '@core/firebase/db';
import {AudioPlayer} from '@app/core/audio/audio-player';

type LibFile = {
  id: string; title?: string; name?: string;
  storagePath: string; mime?: string | null; duration?: number | null;
  peaks?: number[] | null; bpm?: number | null; key?: string | null; tags?: string[] | null;
};

@Component({
  standalone: true,
  selector: 'app-pack-new',
  imports: [CommonModule, FormsModule, DragDropModule],
  templateUrl: './pack-new.html',
  styleUrls: ['./pack-new.scss'],
})
export class PackNew {
  private db = inject(Db);
  private auth = inject(Auth);
  private router = inject(Router);
  private player = inject(AudioPlayer);

  // left (pack builder)
  title = signal('');
  isPublic = signal(false);
  producer = signal('');
  publisher = signal('');
  year = signal<string>('');
  tagsInput = signal('');
  desc = signal('');

  artworkUrl = signal<string | null>(null);
  artworkFile: File | null = null;

  // chosen items (local while editing)
  chosen = signal<LibFile[]>([]);

  // right (library)
  library = signal<LibFile[]>([]);
  trackById = (_: number, f: LibFile) => f.id;
  libQuery = signal('');
  loading = signal(true);

  // accept any drag into pack list
  enterAny = (_drag: CdkDrag, _drop: CdkDropList) => true;   // accept into Pack
  noEnter  = (_drag: CdkDrag, _drop: CdkDropList) => false;  // block entering Library

  async ngOnInit() {
    const uid = this.auth.currentUser?.uid ?? 'dev-user';
    this.db.filesStream(uid, 500).subscribe(list => {
      this.library.set((list as any[]).map(x => ({
        id: x.id, title: x.title, name: x.name,
        storagePath: x.storagePath, mime: x.mime ?? x.contentType,
        duration: x.duration ?? null, peaks: x.peaks ?? null,
        bpm: x.bpm ?? null, key: x.key ?? null, tags: x.tags ?? [],
      })));
      this.loading.set(false);
    });
  }

  // derived
  filteredLib = computed(() => {
    const q = this.libQuery().trim().toLowerCase();
    const chosenIds = new Set(this.chosen().map(x => x.id));
    let arr = this.library().filter(f => !chosenIds.has(f.id));
    if (q) {
      arr = arr.filter(f =>
        (f.title || f.name || '').toLowerCase().includes(q) ||
        (f.tags || []).some(t => (t || '').toLowerCase().includes(q)) ||
        (f.key || '').toLowerCase().includes(q) ||
        String(f.bpm ?? '').includes(q)
      );
    }
    return arr;
  });

  displayName = (f: LibFile) => (f.title || f.name || 'Untitled');

  // ---- drag & drop into the pack area
  onDropPack(ev: CdkDragDrop<any>) {
    const pack = this.chosen();

    // same-container reorder
    if (ev.previousContainer === ev.container) {
      moveItemInArray(pack, ev.previousIndex, ev.currentIndex);
      this.chosen.set([...pack]);
      return;
    }

    // dragged from library: the data is the LibFile
    const it = ev.item.data as LibFile;
    const existing = pack.findIndex(x => x.id === it.id);
    if (existing >= 0) {
      moveItemInArray(pack, existing, ev.currentIndex);
    } else {
      pack.splice(ev.currentIndex, 0, it);
      this.chosen.set([...pack]);
      setTimeout(() => {
        const list = document.querySelectorAll('.dropzone .row');
        const el = list[ev.currentIndex] as HTMLElement;
        el?.classList.add('added'); setTimeout(() => el?.classList.remove('added'), 320);
      }, 0);
    }
    this.chosen.set([...pack]);
  }

  add(f: LibFile) {
    this.chosen.set([...this.chosen(), f]);
  }

  remove(i: number) {
    const arr = [...this.chosen()];
    arr.splice(i, 1);
    this.chosen.set(arr);
  }

  // preview
  async preview(f: LibFile) {
    const url = await this.db.urlFor(f.storagePath);
    const peaks = Array.isArray(f.peaks)
      ? (f.peaks.length && !Array.isArray((f.peaks as any)[0]) ? [f.peaks as any] : f.peaks as any)
      : undefined;
    await this.player.setTrack({
      id: f.id, src: url, title: this.displayName(f),
      mime: f.mime || undefined, duration: f.duration || undefined, peaks
    });
    this.player.play();
  }

  // artwork upload
  onArtworkFile(file?: File) {
    if (!file) return;
    this.artworkFile = file;
    const reader = new FileReader();
    reader.onload = () => this.artworkUrl.set(String(reader.result || ''));
    reader.readAsDataURL(file);
  }

  // create pack
  async create(openAfter = true) {
    if (this.creating()) return;
    const uid = this.auth.currentUser?.uid ?? 'dev-user';
    const title = (this.title() || 'Untitled pack').trim();
    if (!title) return;

    this.creating.set(true);
    try {
      const pack = await this.db.createPack(title, uid);

      // metadata
      const meta = {
        isPublic: this.isPublic(),
        producer: this.producer().trim() || null,
        publisher: this.publisher().trim() || null,
        year: this.year().trim() ? Math.max(0, Number(this.year())) : null,
        tags: this.tagsInput().split(',').map(t => t.trim()).filter(Boolean),
        desc: this.desc().trim() || null,
      };
      await this.db.savePackMeta(pack.id, meta);

      // artwork
      if (this.artworkFile) {
        await this.db.uploadPackArtwork(pack.id, this.artworkFile);
      }

      // items
      for (const f of this.chosen()) {
        await this.db.addFileAsPackItem(pack.id, f);
      }
      await this.db.recomputePackStats(pack.id);

      if (openAfter) {
        await this.router.navigate(['/app/packs', pack.id]);
      }
    } finally {
      this.creating.set(false);
    }
  }

  // state
  creating = signal(false);
}

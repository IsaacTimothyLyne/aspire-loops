import {
  Component,
  HostListener,
  OnDestroy,
  inject,
  signal,
  computed,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Auth } from '@angular/fire/auth';
import { Db } from '@app/core/firebase/db';
import { AudioPlayer } from '@app/core/audio/audio-player';
import { UploaderComponent } from '@shared/ui/uploader/uploader';
import { Subscription } from 'rxjs';
import { Shares } from '@core/firebase/shares';

type LibFile = {
  id: string;
  name?: string;
  title?: string;
  ext?: string | null;
  mime?: string | null;
  size?: number | null;
  duration?: number | null;    // seconds
  bpm?: number | null;
  key?: string | null;
  tags?: string[] | null;
  type?: string | null;
  storagePath: string;
  createdAt: number;
  updatedAt: number;
  previewPath?: string | null;
  previewReady?: boolean;
  peaks?: number[] | null;
  status?: 'queued' | 'uploading' | 'done' | 'error' | 'cancelled' | null;
};

@Component({
  standalone: true,
  selector: 'app-library',
  imports: [CommonModule, FormsModule, UploaderComponent],
  templateUrl: './library.html',
  styleUrls: ['./library.scss'],
})
export class Library implements OnDestroy {
  private auth = inject(Auth);
  private db = inject(Db);
  private player = inject(AudioPlayer);
  private shares = inject(Shares);
  private sub?: Subscription;

  // ---------- base data ----------
  uid = signal<string>('dev-user');
  files = signal<LibFile[]>([]);
  isLoading = signal(true);
  readonly TYPE_OPTIONS = [
    'audio','loop','master','mix','demo','topline','idea','stem',
    'instrumental','acapella','preview','reference','sample',
    'drum-loop','melody-loop','vocal','sfx'
  ];

  // ---------- filters / search / sort ----------
  q = signal('');
  debouncedQ = signal('');
  filtersOpen = signal(false);

  // Types (multi)
  typeSet = signal<Set<string>>(new Set());

  // Tags (multi)
  tagSet = signal<Set<string>>(new Set());

  // Keys (multi) – normalize to uppercase (e.g., 'AM', 'C#', 'Gm' → 'AM','C#','GM')
  keySet = signal<Set<string>>(new Set());

  // BPM range
  bpmEnabled = signal(false);
  bpmMin = signal<number>(0);
  bpmMax = signal<number>(300);
  includeUnknownBpm = signal(true);

  // Sort
  sortBy = signal<'recent'|'title'|'bpm'|'duration'>('recent');
  sortDir = signal<'desc'|'asc'>('desc');

  // selection / ui
  lastPlayedId = signal<string | null>(null);
  playingId   = computed(() => this.player.current()?.id ?? null);
  hasFiles    = computed(() => this.files().length > 0);

  // context menu
  menuOpen = signal(false);
  menuX = signal(0);
  menuY = signal(0);
  selected = signal<LibFile | null>(null);

  // edit modal
  edit = signal<{ id: string; title: string; bpm: string; key: string; tags: string; type: string } | null>(null);

  // derived facets
  allTypes = computed(() => {
    const s = new Set<string>();
    for (const f of this.files()) s.add((f.type || 'audio').toLowerCase());
    // keep user-preferred order, but show any unknown types too
    const base = this.TYPE_OPTIONS.map(t => t.toLowerCase());
    const rest = [...s].filter(t => !base.includes(t));
    return [...base.filter(t => s.has(t)), ...rest].slice(0, 40);
  });

  allTags = computed<{ name: string; count: number }[]>(() => {
    const map = new Map<string, number>();
    for (const f of this.files()) {
      for (const t of (f.tags ?? [])) {
        const key = (t || '').trim();
        if (!key) continue;
        map.set(key, (map.get(key) ?? 0) + 1);
      }
    }
    return [...map.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a,b) => b.count - a.count)
      .slice(0, 200);
  });

  allKeys = computed(() => {
    const s = new Set<string>();
    for (const f of this.files()) {
      const k = (f.key || '').trim();
      if (k) s.add(k.toUpperCase());
    }
    return [...s].sort();
  });

  // debounced search
  constructor() {
    let t: any;
    effect(() => {
      const v = this.q();
      clearTimeout(t);
      t = setTimeout(() => this.debouncedQ.set(v.trim().toLowerCase()), 120);
    });
  }

  async ngOnInit() {
    this.uid.set(this.auth.currentUser?.uid ?? 'dev-user');
    this.sub = this.db.filesStream(this.uid(), 500).subscribe({
      next: (list) => {
        const arr = (list as LibFile[]) || [];
        this.files.set(arr);
        // init BPM range from data
        const bpms = arr.map(f => f.bpm).filter((n): n is number => typeof n === 'number' && isFinite(n));
        const lo = bpms.length ? Math.min(...bpms) : 0;
        const hi = bpms.length ? Math.max(...bpms) : 300;
        this.bpmMin.set(lo);
        this.bpmMax.set(hi);
        this.isLoading.set(false);
      },
      error: () => this.isLoading.set(false),
    });
  }
  ngOnDestroy() { this.sub?.unsubscribe(); }

  // ---------- filtering pipeline ----------
  visible = computed<LibFile[]>(() => {
    let arr = this.files();

    // search
    const q = this.debouncedQ();
    if (q) {
      arr = arr.filter(f => {
        const title = (this.displayName(f) || '').toLowerCase();
        const name  = (f.name || '').toLowerCase();
        const type  = (f.type || '').toLowerCase();
        const key   = (f.key  || '').toLowerCase();
        const ext   = (f.ext  || f.mime || '').toLowerCase();
        const tags  = (f.tags || []).map(t => (t || '').toLowerCase()).join(' ');
        return title.includes(q) || name.includes(q) || type.includes(q) || key.includes(q) || ext.includes(q) || tags.includes(q);
      });
    }

    // types
    const types = this.typeSet();
    if (types.size) {
      arr = arr.filter(f => types.has((f.type || 'audio').toLowerCase()));
    }

    // tags (AND match)
    const tags = this.tagSet();
    if (tags.size) {
      arr = arr.filter(f => {
        const set = new Set((f.tags || []).map(t => (t || '').trim()));
        for (const t of tags) if (!set.has(t)) return false;
        return true;
      });
    }

    // keys
    const keys = this.keySet();
    if (keys.size) {
      arr = arr.filter(f => keys.has((f.key || '').toUpperCase()));
    }

    // BPM range
    if (this.bpmEnabled()) {
      const lo = this.bpmMin(); const hi = this.bpmMax();
      arr = arr.filter(f => {
        const n = f.bpm;
        if (typeof n === 'number' && isFinite(n)) return n >= lo && n <= hi;
        return this.includeUnknownBpm();
      });
    }

    // sort
    const by = this.sortBy(); const dir = this.sortDir();
    const mul = dir === 'asc' ? 1 : -1;
    arr = [...arr].sort((a,b) => {
      switch (by) {
        case 'title':
          return mul * this.displayName(a).localeCompare(this.displayName(b));
        case 'bpm':
          return mul * ((a.bpm ?? -1) - (b.bpm ?? -1));
        case 'duration':
          return mul * ((a.duration ?? -1) - (b.duration ?? -1));
        case 'recent':
        default:
          return mul * ((a.updatedAt ?? 0) - (b.updatedAt ?? 0));
      }
    });

    return arr;
  });

  // ---------- helpers ----------
  basename(f: LibFile) {
    if (f.title?.trim()) return f.title.trim();
    const n = (f.name || '').trim();
    const i = n.lastIndexOf('.');
    return i > 0 ? n.slice(0, i) : n || 'Untitled';
  }
  displayName = (f: LibFile) => (f.title || '').trim() || this.basename(f);
  isCurrent = (f: LibFile) => this.playingId() === f.id && this.player.isPlaying();
  trackById = (_: number, f: LibFile) => f.id;

  visibleTags(f: LibFile, max = 2) { return (f.tags ?? []).slice(0, max); }
  hiddenTagCount(f: LibFile, max = 2) {
    const n = (f.tags ?? []).length;
    return n > max ? n - max : 0;
  }
  truncateTag(t: string, len = 14) { return t.length > len ? t.slice(0, len - 1) + '…' : t; }

  formatBytes(n?: number | null) {
    const v = typeof n === 'number' ? n : 0;
    if (v < 1024) return `${v} B`;
    const units = ['KB','MB','GB','TB'];
    let i = -1, num = v;
    do { num /= 1024; i++; } while (num >= 1024 && i < units.length - 1);
    return `${num.toFixed(num < 10 ? 1 : 0)} ${units[i]}`;
  }
  formatDuration(sec?: number | null) {
    const s = Math.max(0, Math.floor(sec ?? 0));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${r.toString().padStart(2, '0')}`;
  }

  // ---------- playback ----------
  async play(f: LibFile) {
    const url = await this.db.urlFor(f.storagePath);
    await this.player.setTrack({
      id: f.id,
      src: url,
      title: this.basename(f),
      mime: f.mime ?? undefined,
      peaks: f.peaks ?? undefined,
      duration: f.duration ?? undefined,
    });
    this.player.play();
    this.lastPlayedId.set(f.id);
  }
  playIfReady(f: LibFile) { if (f.status === 'done' || f.status == null) this.play(f); }
  async toggle(f: LibFile) {
    const cur = this.player.current();
    if (cur?.id === f.id) { this.player.toggle(); return; }
    await this.play(f);
  }

  // ---------- context menu ----------
  openMenu(e: MouseEvent, f: LibFile) {
    e.preventDefault(); e.stopPropagation();
    this.selected.set(f);
    const MENU_W = 220, MENU_H = 196;
    let x = e.clientX, y = e.clientY;
    const vw = window.innerWidth, vh = window.innerHeight;
    if (x + MENU_W > vw) x = vw - MENU_W - 12;
    if (y + MENU_H > vh) y = vh - MENU_H - 12;
    const pad = 8;
    if (x + MENU_W > vw - pad) x = vw - MENU_W - pad;
    if (y + MENU_H > vh - pad) y = vh - MENU_H - pad;
    this.menuX.set(x); this.menuY.set(y); this.menuOpen.set(true);
  }
  toggleRowMenu(e: MouseEvent, f: LibFile) {
    e.stopPropagation();
    if (this.menuOpen() && this.selected()?.id === f.id) this.menuOpen.set(false);
    else this.openMenu(e, f);
  }
  closeMenu() { this.menuOpen.set(false); }
  @HostListener('document:keydown.escape') onEsc() { if (this.edit()) this.closeEdit(); else this.closeMenu(); }

  // ---------- edit ----------
  openEdit(f: LibFile) {
    this.edit.set({
      id: f.id,
      title: this.displayName(f),
      bpm: f.bpm != null ? String(f.bpm) : '',
      key: f.key ?? '',
      tags: (f.tags ?? []).join(', '),
      type: (f.type ?? 'audio'),
    });
    this.menuOpen.set(false);
    queueMicrotask(() => document.getElementById('edit-title')?.focus());
  }
  startRename(f: LibFile) { this.openEdit(f); }
  editItem(f: LibFile) { this.openEdit(f); }

  async saveEdit() {
    const e = this.edit(); if (!e) return;
    const patch: any = {};
    const title = e.title.trim();  patch.title = title || null;

    patch.bpm = e.bpm === '' ? null : Math.max(0, Math.round(Number(e.bpm)));
    const key = e.key.trim();      patch.key = key || null;

    const tags = e.tags.split(',').map(t => t.trim()).filter(Boolean);
    patch.tags = tags.length ? tags : [];

    const type = (e.type || '').trim().toLowerCase();
    patch.type = type || null;

    await this.db.markFileDoc(e.id, patch);
    this.edit.set(null);
  }
  closeEdit() { this.edit.set(null); }

  // ---------- delete ----------
  remove(f: LibFile) {
    this.closeMenu();
    if (!f?.id) return;

    if (this.player.current()?.id === f.id) {
      this.player.pause();
      this.player.setTrack({ src: '', title: 'Nothing playing' });
    }
    const ok = confirm(`Delete "${this.displayName(f)}"? This cannot be undone.`);
    if (!ok) return;

    const id = f.id;
    const prev = this.files();
    this.files.update(list => list.filter(x => x.id !== id));

    this.db.deleteFile({ id, storagePath: f.storagePath }).catch(err => {
      console.error('Delete failed', err);
      this.files.set(prev);
      alert('Failed to delete. See console for details.');
    });
  }

  // ---------- share ----------
  shareSheet = signal<{ loading: boolean; link?: string; shareId?: string; f?: any } | null>(null);

  async share(f: any) {
    this.closeMenu();
    this.shareSheet.set({ loading: true, f });
    try {
      const s = await this.shares.createFileShare({
        id: f.id, ownerUid: f.ownerUid || this.uid(),
        storagePath: f.storagePath,
        title: this.displayName(f),
        mime: f.mime ?? null, duration: f.duration ?? null,
        peaks: f.peaks ?? null, tags: f.tags ?? null, type: f.type ?? 'audio',
      });
      const link = `${location.origin}/s/${s.id}`;
      this.shareSheet.set({ loading: false, link, shareId: s.id, f });
    } catch (e) {
      console.error(e);
      this.shareSheet.set(null);
      alert('Failed to create share link');
    }
  }
  async revokeShare() {
    const s = this.shareSheet(); if (!s?.shareId) return;
    await this.shares.revokeShare(s.shareId);
    this.shareSheet.set(null);
  }

  // ---------- filter/UI handlers ----------
  toggleType(t: string) {
    const set = new Set(this.typeSet());
    set.has(t) ? set.delete(t) : set.add(t);
    this.typeSet.set(set);
  }
  toggleTag(t: string) {
    const set = new Set(this.tagSet());
    set.has(t) ? set.delete(t) : set.add(t);
    this.tagSet.set(set);
  }
  toggleKey(k: string) {
    const set = new Set(this.keySet());
    set.has(k) ? set.delete(k) : set.add(k);
    this.keySet.set(set);
  }
  clearFilters() {
    this.q.set('');
    this.typeSet.set(new Set());
    this.tagSet.set(new Set());
    this.keySet.set(new Set());
    this.bpmEnabled.set(false);
    // keep bpm bounds; user can re-enable
  }

  protected readonly navigator = navigator;

  onRowKey($event: KeyboardEvent, f: LibFile) {

  }

  protected readonly Math = Math;
}

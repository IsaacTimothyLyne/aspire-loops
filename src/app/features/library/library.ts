import {
  Component,
  HostListener,
  OnDestroy,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Auth } from '@angular/fire/auth';
import { UploaderComponent } from '@shared/ui/uploader/uploader';
import { Db } from '@app/core/firebase/db';
import { AudioPlayer } from '@app/core/audio/audio-player';
import { Shares } from '@core/firebase/shares';
import { Subscription } from 'rxjs';

type LibFile = {
  id: string;
  name?: string;
  title?: string;
  ext?: string | null;
  mime?: string | null;
  size?: number | null;
  duration?: number | null;
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
  // Services
  private auth = inject(Auth);
  private db = inject(Db);
  private player = inject(AudioPlayer);
  private shares = inject(Shares);
  private sub?: Subscription;

  // ---------- Data ----------
  uid = signal<string>('dev-user');
  files = signal<LibFile[]>([]);
  isLoading = signal(true);

  readonly TYPE_OPTIONS = [
    'audio', 'loop', 'master', 'mix', 'demo', 'topline', 'idea', 'stem',
    'instrumental', 'acapella', 'preview', 'reference', 'sample',
    'drum-loop', 'melody-loop', 'vocal', 'sfx',
  ] as const;

  // ---------- Search / Filters / Sort ----------
  q = signal('');
  debouncedQ = signal('');
  filtersOpen = signal(false);

  typeSet = signal<Set<string>>(new Set());
  tagSet = signal<Set<string>>(new Set());
  keySet = signal<Set<string>>(new Set()); // normalized uppercase

  bpmEnabled = signal(false);
  bpmMin = signal<number>(0);
  bpmMax = signal<number>(300);
  includeUnknownBpm = signal(true);

  sortBy = signal<'recent' | 'title' | 'bpm' | 'duration'>('recent');
  sortDir = signal<'asc' | 'desc'>('desc');

  // ---------- Selection / UI ----------
  selection = signal<Set<string>>(new Set());
  lastAnchor = signal<number | null>(null);
  selCount = computed(() => this.selection().size);
  bulkBusy = signal(false);

  lastPlayedId = signal<string | null>(null);
  playingId = computed(() => this.player.current()?.id ?? null);
  hasFiles = computed(() => this.files().length > 0);

  // Context menu
  menuOpen = signal(false);
  menuX = signal(0);
  menuY = signal(0);
  selected = signal<LibFile | null>(null);

  // Edit single file
  edit = signal<{ id: string; title: string; bpm: string; key: string; tags: string; type: string } | null>(null);

  // Bulk edit
  bulkEdit = signal<{ bpm?: string; key?: string; type?: string; tags?: string; mergeTags: boolean } | null>(null);

  // Share sheet
  shareSheet = signal<{ loading: boolean; link?: string; shareId?: string; f?: LibFile } | null>(null);

  // ---------- Facets ----------
  allTypes = computed(() => {
    const present = new Set<string>();
    for (const f of this.files()) present.add((f.type || 'audio').toLowerCase());
    const preferred = this.TYPE_OPTIONS.map(t => t.toLowerCase());
    const extra = [...present].filter(t => !preferred.includes(t));
    return [...preferred.filter(t => present.has(t)), ...extra].slice(0, 40);
  });

  allTags = computed<{ name: string; count: number }[]>(() => {
    const map = new Map<string, number>();
    for (const f of this.files()) {
      for (const t of (f.tags ?? [])) {
        const k = (t || '').trim();
        if (!k) continue;
        map.set(k, (map.get(k) ?? 0) + 1);
      }
    }
    return [...map.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
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

  // ---------- Debounce search ----------
  constructor() {
    let t: any;
    effect(() => {
      const v = this.q();
      clearTimeout(t);
      t = setTimeout(() => this.debouncedQ.set(v.trim().toLowerCase()), 120);
    });
  }

  // ---------- Lifecycle ----------
  async ngOnInit() {
    this.uid.set(this.auth.currentUser?.uid ?? 'dev-user');
    this.sub = this.db.filesStream(this.uid(), 500).subscribe({
      next: (list) => {
        const arr = (list as LibFile[]) || [];
        this.files.set(arr);

        // Initialize BPM bounds from data, once per refresh
        const bpms = arr
          .map(f => f.bpm)
          .filter((n): n is number => typeof n === 'number' && isFinite(n));
        const lo = bpms.length ? Math.min(...bpms) : 0;
        const hi = bpms.length ? Math.max(...bpms) : 300;
        this.bpmMin.set(lo);
        this.bpmMax.set(hi);

        this.isLoading.set(false);
      },
      error: () => this.isLoading.set(false),
    });
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
  }

  // ---------- Visible list (filters + sort) ----------
  visible = computed<LibFile[]>(() => {
    let arr = this.files();

    // Search
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

    // Types
    const types = this.typeSet();
    if (types.size) arr = arr.filter(f => types.has((f.type || 'audio').toLowerCase()));

    // Tags (AND)
    const tags = this.tagSet();
    if (tags.size) {
      arr = arr.filter(f => {
        const set = new Set((f.tags || []).map(t => (t || '').trim()));
        for (const t of tags) if (!set.has(t)) return false;
        return true;
      });
    }

    // Keys
    const keys = this.keySet();
    if (keys.size) arr = arr.filter(f => keys.has((f.key || '').toUpperCase()));

    // BPM
    if (this.bpmEnabled()) {
      const lo = this.bpmMin(), hi = this.bpmMax();
      arr = arr.filter(f => {
        const n = f.bpm;
        if (typeof n === 'number' && isFinite(n)) return n >= lo && n <= hi;
        return this.includeUnknownBpm();
      });
    }

    // Sort
    const by = this.sortBy();
    const dir = this.sortDir();
    const mul = dir === 'asc' ? 1 : -1;

    return [...arr].sort((a, b) => {
      switch (by) {
        case 'title':    return mul * this.displayName(a).localeCompare(this.displayName(b));
        case 'bpm':      return mul * ((a.bpm ?? -1) - (b.bpm ?? -1));
        case 'duration': return mul * ((a.duration ?? -1) - (b.duration ?? -1));
        case 'recent':
        default:         return mul * ((a.updatedAt ?? 0) - (b.updatedAt ?? 0));
      }
    });
  });

  // ---------- Row helpers ----------
  basename(f: LibFile) {
    if (f.title?.trim()) return f.title.trim();
    const n = (f.name || '').trim();
    const i = n.lastIndexOf('.');
    return i > 0 ? n.slice(0, i) : n || 'Untitled';
  }
  displayName = (f: LibFile) => (f.title || '').trim() || this.basename(f);
  prettyName = (f: LibFile) =>
    this.displayName(f).replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  isCurrent = (f: LibFile) => this.playingId() === f.id && this.player.isPlaying();
  trackById = (_: number, f: LibFile) => f.id;

  visibleTags(f: LibFile, max = 2) { return (f.tags ?? []).slice(0, max); }
  hiddenTagCount(f: LibFile, max = 2) { const n = (f.tags ?? []).length; return n > max ? n - max : 0; }
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

  // ---------- Playback ----------
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

  // ---------- Selection (click / shift / cmd) ----------
  isSelected = (id: string) => this.selection().has(id);
  clearSelection() { this.selection.set(new Set()); this.lastAnchor.set(null); }

  private setRangeSelected(start: number, end: number, on = true) {
    const ids = this.visible().slice(Math.min(start, end), Math.max(start, end) + 1).map(f => f.id);
    const set = new Set(this.selection());
    ids.forEach(id => on ? set.add(id) : set.delete(id));
    this.selection.set(set);
  }

  toggleOne(id: string, _e?: Event, idx?: number) {
    const set = new Set(this.selection());
    set.has(id) ? set.delete(id) : set.add(id);
    this.selection.set(set);
    if (typeof idx === 'number') this.lastAnchor.set(idx);
  }

  onRowClick(e: MouseEvent, f: LibFile, idx: number) {
    if (e.shiftKey && this.lastAnchor() != null) { this.setRangeSelected(this.lastAnchor()!, idx, true); return; }
    if (e.metaKey || e.ctrlKey) { this.toggleOne(f.id, e, idx); return; }
    this.selection.set(new Set([f.id])); this.lastAnchor.set(idx);
  }

  // Keyboard on focused row
  onRowKey(e: KeyboardEvent, f: LibFile) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.playIfReady(f); }
  }

  // Global keys
  @HostListener('document:keydown', ['$event'])
  onDocKey(e: KeyboardEvent) {
    const el = e.target as HTMLElement | null;
    const tag = (el?.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || el?.isContentEditable) return;

    const isMac = navigator.platform.toLowerCase().includes('mac');
    const cmd = isMac ? e.metaKey : e.ctrlKey;

    // Select all visible
    if (cmd && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      this.selection.set(new Set(this.visible().map(f => f.id)));
      return;
    }

    // Escape: close sheets/menus or clear selection
    if (e.key === 'Escape') {
      if (this.edit()) this.edit.set(null);
      else if (this.bulkEdit()) this.bulkEdit.set(null);
      else if (this.menuOpen()) this.menuOpen.set(false);
      else this.clearSelection();
      return;
    }

    // Delete
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (this.selCount() > 0) { e.preventDefault(); this.bulkDelete(); }
    }

    // E → bulk edit
    if (!cmd && e.key.toLowerCase() === 'e') {
      if (this.selCount() > 0) { e.preventDefault(); this.openBulkEdit(); }
    }
  }

  // ---------- Bulk actions ----------
  openBulkEdit() { if (this.selCount() > 0) this.bulkEdit.set({ bpm: '', key: '', type: '', tags: '', mergeTags: true }); }
  async applyBulkEdit() {
    const s = this.bulkEdit(); if (!s) return;
    const ids = [...this.selection()]; if (!ids.length) { this.bulkEdit.set(null); return; }

    const patchBase: any = {};
    if (s.bpm?.trim()) patchBase.bpm = Math.max(0, Math.round(+s.bpm! || 0));
    if (s.key?.trim()) patchBase.key = s.key!.trim();
    if (s.type?.trim()) patchBase.type = s.type!.trim().toLowerCase();

    const newTags = (s.tags || '').split(',').map(t => t.trim()).filter(Boolean);

    await Promise.all(ids.map(async id => {
      const cur = this.files().find(f => f.id === id);
      const patch: any = { ...patchBase };
      if (newTags.length) {
        if (s.mergeTags) {
          const merged = Array.from(new Set([...(cur?.tags || []), ...newTags]));
          patch.tags = merged.slice(0, 50);
        } else {
          patch.tags = newTags.slice(0, 50);
        }
      }
      await this.db.markFileDoc(id, patch);
    }));

    this.bulkEdit.set(null);
  }

  async bulkDelete() {
    const ids = [...this.selection()]; if (!ids.length) return;
    const ok = confirm(`Delete ${ids.length} file${ids.length > 1 ? 's' : ''}? This cannot be undone.`);
    if (!ok) return;

    // Stop player if needed
    const curId = this.player.current()?.id;
    if (curId && this.selection().has(curId)) {
      this.player.pause();
      this.player.setTrack({ src: '', title: 'Nothing playing' });
    }

    this.bulkBusy.set(true);
    const prev = this.files();

    // Optimistic UI
    this.files.update(list => list.filter(x => !this.selection().has(x.id)));
    this.selection.set(new Set());

    try {
      await Promise.allSettled(ids.map(async id => {
        const f = prev.find(x => x.id === id);
        if (f) await this.db.deleteFile({ id, storagePath: f.storagePath });
      }));
    } catch (e) {
      console.error('Bulk delete error', e);
      this.files.set(prev);
      alert('Failed to delete some files. See console.');
    } finally {
      this.bulkBusy.set(false);
    }
  }

  // ---------- Context menu ----------
  openMenu(e: MouseEvent, f: LibFile) {
    e.preventDefault(); e.stopPropagation();
    this.selected.set(f);
    const MENU_W = 220, MENU_H = 196;
    let x = e.clientX, y = e.clientY;
    const vw = window.innerWidth, vh = window.innerHeight;
    if (x + MENU_W > vw) x = vw - MENU_W - 12;
    if (y + MENU_H > vh) y = vh - MENU_H - 12;
    this.menuX.set(Math.max(8, x));
    this.menuY.set(Math.max(8, y));
    this.menuOpen.set(true);
  }
  toggleRowMenu(e: MouseEvent, f: LibFile) {
    e.stopPropagation();
    if (this.menuOpen() && this.selected()?.id === f.id) this.menuOpen.set(false); else this.openMenu(e, f);
  }
  closeMenu() { this.menuOpen.set(false); }

  // ---------- Single edit ----------
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

  // ---------- Single delete ----------
  remove(f: LibFile) {
    this.closeMenu();
    if (!f?.id) return;

    if (this.player.current()?.id === f.id) {
      this.player.pause();
      this.player.setTrack({ src: '', title: 'Nothing playing' });
    }

    const ok = confirm(`Delete "${this.displayName(f)}"? This cannot be undone.`);
    if (!ok) return;

    const prev = this.files();
    this.files.update(list => list.filter(x => x.id !== f.id));

    this.db.deleteFile({ id: f.id, storagePath: f.storagePath }).catch(err => {
      console.error('Delete failed', err);
      this.files.set(prev);
      alert('Failed to delete. See console for details.');
    });
  }

  // ---------- Share ----------
  async share(f: LibFile) {
    this.closeMenu();
    this.shareSheet.set({ loading: true, f });
    try {
      const s = await this.shares.createFileShare({
        id: f.id,
        ownerUid: (f as any).ownerUid || this.uid(), // ownerUid not in LibFile type
        storagePath: f.storagePath,
        title: this.displayName(f),
        mime: f.mime ?? null,
        duration: f.duration ?? null,
        peaks: f.peaks ?? null,
        tags: f.tags ?? null,
        type: f.type ?? 'audio',
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

  // ---------- Filters UI ----------
  toggleType(t: string) { const set = new Set(this.typeSet()); set.has(t) ? set.delete(t) : set.add(t); this.typeSet.set(set); }
  toggleTag(t: string)  { const set = new Set(this.tagSet());  set.has(t) ? set.delete(t) : set.add(t); this.tagSet.set(set); }
  toggleKey(k: string)  { const set = new Set(this.keySet());  set.has(k) ? set.delete(k) : set.add(k); this.keySet.set(set); }
  clearFilters() {
    this.q.set('');
    this.typeSet.set(new Set());
    this.tagSet.set(new Set());
    this.keySet.set(new Set());
    this.bpmEnabled.set(false);
  }

  protected readonly navigator = navigator;
  protected readonly Math = Math;
}

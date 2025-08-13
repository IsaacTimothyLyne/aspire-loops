import { Component, ElementRef, HostListener, ViewChild, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Db } from '../../../core/db';
import { Wave } from '../../../core/wave';
import { UploaderComponent } from '../../../components/uploader/uploader';

@Component({
  standalone: true,
  selector: 'app-pack',
  imports: [CommonModule, FormsModule, RouterLink, UploaderComponent],
  templateUrl: './pack.html',
  styleUrls: ['./pack.scss']
})
export class Pack {
  private route = inject(ActivatedRoute);
  public db = inject(Db);
  private wave = inject(Wave);

  packId = signal<string>('');
  title = signal('New Pack');
  createdAt = signal<Date>(new Date());
  items = signal<any[]>([]);
  selectedId = signal<string | null>(null);
  isLoading = signal<boolean>(false);

  @ViewChild('wave', { static: false }) waveEl?: ElementRef<HTMLDivElement>;

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.packId.set(id);
    await this.refreshPackHeader();
    // live stream of items
    this.db.itemsStream(id).subscribe(list => {
      this.items.set(list);
      // if selection disappeared, clear it
      if (this.selectedId() && !list.find(i => i.id === this.selectedId()))
        this.selectedId.set(null);
    });
  }

  async refreshPackHeader() {
    const pack = await this.db.getPack(this.packId());
    if (pack) { this.title.set(pack.title); this.createdAt.set(new Date(pack.createdAt)); }
  }

  onUploaded() { /* header already bumps via updatePack */ }

  // --- inline saves ---
  async saveField(it: any, field: 'name'|'bpm'|'key'|'tags', value: any) {
    const patch: any = {};
    if (field === 'bpm') value = value === '' ? null : Number(value);
    if (field === 'tags') value = Array.isArray(value) ? value : (''+value).split(',').map((t: string) => t.trim()).filter(Boolean);
    patch[field] = value;
    await this.db.updateItemTouch(this.packId(), it.id, patch);
    // recompute stats on bpm/key change
    if (field === 'bpm' || field === 'key') await this.db.recomputePackStats(this.packId());
  }

  // --- preview ---
  async select(it: any) {
    this.selectedId.set(it.id);
    if (!this.waveEl) return;
    const blob = await this.db.blobFor(it.storagePath);
    console.log('loading from blob', blob.type, blob.size);
    await this.wave.load(this.waveEl.nativeElement, blob);
  }

  @HostListener('window:keydown', ['$event'])
  onKey(e: KeyboardEvent) {
    if (e.code === 'Space') { e.preventDefault(); this.wave.playPause(); }
    if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
      const list = this.items();
      if (!list.length) return;
      const idx = Math.max(0, list.findIndex(i => i.id === this.selectedId()));
      const next = e.code === 'ArrowDown' ? Math.min(list.length - 1, idx + 1) : Math.max(0, idx - 1);
      const it = list[next];
      if (it) this.select(it);
    }
  }

  protected readonly HTMLInputElement = HTMLInputElement;
  protected readonly blur = blur;
}

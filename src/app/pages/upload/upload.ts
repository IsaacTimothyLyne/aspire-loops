import { Component, inject, signal } from '@angular/core';
import {CommonModule, NgForOf, NgIf} from '@angular/common';
import { FormsModule } from '@angular/forms';
import {Router, RouterLink} from '@angular/router';

import { Storage, ref, uploadBytesResumable } from '@angular/fire/storage';
import { Db } from '../../core/db';
import { AuthService } from '../../core/auth';
import { parseFilename } from '../../core/parse';

type Row = { file: File; name: string; pct: number; status: 'queued'|'uploading'|'done'|'error' };


@Component({
  selector: 'app-upload',
  imports: [
    NgIf,
    FormsModule,
    NgForOf,
    RouterLink
  ],
  templateUrl: './upload.html',
  styleUrl: './upload.scss'
})
export class Upload {
  private storage = inject(Storage);
  private db = inject(Db);
  private auth = inject(AuthService);
  private router = inject(Router);

  // destination picker
  dest: 'new'|'existing' = 'new';
  packTitle = '';
  existingPackId = '';
  myPacks = signal<any[]>([]);

  rows = signal<Row[]>([]);
  working = signal(false);
  error = signal('');

  async ngOnInit() {
    const u = this.auth.user$.value;
    if (!u) return;
    // preload packs for “existing” selector
    this.myPacks.set(await this.db.myPacks(u.uid, 50));
  }

  onPick(e: Event) {
    const files = Array.from((e.target as HTMLInputElement).files || []);
    this.queue(files);
  }
  onDragOver(e: DragEvent){ e.preventDefault(); }
  onDrop(e: DragEvent){ e.preventDefault(); this.queue(Array.from(e.dataTransfer?.files || [])); }

  queue(files: File[]) {
    const newRows = files.map(f => {
      const meta = parseFilename(f.name);
      return { file: f, name: meta.cleanName, pct: 0, status: 'queued' as const };
    });
    this.rows.update(r => [...r, ...newRows]);
    if (this.dest === 'new' && !this.packTitle && newRows[0]) {
      // suggest a title from first file
      this.packTitle = parseFilename(newRows[0].file.name).cleanName || 'New Pack';
    }
  }

  async start() {
    this.error.set('');
    if (!this.rows().length) { this.error.set('Add at least one file.'); return; }

    // get or create packId
    const u = this.auth.user$.value!;
    let packId = this.existingPackId;
    if (this.dest === 'new') {
      const title = this.packTitle?.trim() || 'New Pack';
      const p = await this.db.createPack(title, u.uid);
      packId = p.id;
    }
    if (!packId) { this.error.set('Choose a destination pack.'); return; }

    this.working.set(true);
    try {
      for (const row of this.rows()) {
        row.status = 'uploading'; this.rows.update(a=>a.slice());

        // build storage path
        const itemId = crypto.randomUUID();
        const path = `users/${u.uid}/packs/${packId}/items/${itemId}/${row.file.name}`;

        const task = uploadBytesResumable(ref(this.storage, path), row.file,
          { customMetadata: { packId, ownerUid: u.uid } });
        task.on('state_changed', s => {
          row.pct = Math.round(100 * s.bytesTransferred / s.totalBytes);
          this.rows.update(a=>a.slice());
        });

        await task;

        // parse meta and save Firestore item
        const parsed = parseFilename(row.file.name);
        await this.db.addItem(packId, {
          id: itemId,
          packId, type: 'loop',
          name: parsed.cleanName,
          storagePath: path,
          format: row.file.name.toLowerCase().endsWith('.mp3') ? 'mp3' : 'wav',
          bpm: parsed.bpm || null,
          key: parsed.key || null,
        });

        row.status = 'done'; this.rows.update(a=>a.slice());
      }
      // jump to pack
      this.router.navigate(['/pack', packId]);
    } catch (e:any) {
      console.error(e);
      this.error.set(e?.message || 'Upload failed.');
    } finally {
      this.working.set(false);
    }
  }
}

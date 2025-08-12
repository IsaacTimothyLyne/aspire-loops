import {Component, EventEmitter, inject, Input, Output, signal} from '@angular/core';
import { Storage, ref, uploadBytesResumable, getDownloadURL } from '@angular/fire/storage';
import { Auth } from '@angular/fire/auth';
import {Db} from '../../core/db';
import {NgForOf} from '@angular/common';

@Component({
  selector: 'app-uploader',
  standalone: true,
  template: `
    <input type="file" multiple (change)="onPick($event)" accept=".wav,.aiff,.aif,.mp3"/>
    <div *ngFor="let p of progress()">{{ p.name }} — {{ p.pct }}%</div>
  `,
  imports: [
    NgForOf
  ]
})
export class UploaderComponent {
  private storage = inject(Storage);
  private db = inject(Db);

  @Input() packId!: string;
  @Output() uploaded = new EventEmitter<void>();

  rows = signal<{name:string; pct:number}[]>([]);

  // ✅ define exactly what the template uses
  progress = signal<{ name: string; pct: number }[]>([]);

  onDragOver(e: DragEvent){ e.preventDefault(); }
  onDrop(e: DragEvent){
    e.preventDefault();
    const files = Array.from(e.dataTransfer?.files || []);
    this.handle(files);
  }
  async onPick(e: Event) {
    const files = Array.from((e.target as HTMLInputElement).files || []);
    for (const file of files) {
      const itemId = crypto.randomUUID();
      const path = `users/dev-user/packs/${this.packId}/items/${itemId}/${file.name}`;
      const row = { name: file.name, pct: 0 };
      this.progress.update(a => [...a, row]);

      const task = uploadBytesResumable(ref(this.storage, path), file,
        { customMetadata: { packId: this.packId, shareOk: 'true' }});

      task.on('state_changed', s => {
        row.pct = Math.round(100 * s.bytesTransferred / s.totalBytes);
        this.progress.update(a => a.slice());
      });

      await task;
      await this.db.addItem(this.packId, {
        packId: this.packId,
        type: 'loop',
        name: file.name.replace(/\.(wav|aiff|aif|mp3)$/i,''),
        storagePath: path,
        format: file.name.toLowerCase().endsWith('mp3') ? 'mp3' : 'wav'
      });
    }
  }

  private async handle(files: File[]){
    for (const file of files) {
      const itemId = crypto.randomUUID();
      const path = `users/dev-user/packs/${this.packId}/items/${itemId}/${file.name}`;
      const row = { name: file.name, pct: 0 }; this.rows.update(a=>[...a,row]);

      const task = uploadBytesResumable(ref(this.storage, path), file,
        { customMetadata: { packId: this.packId, shareOk: 'true' }});

      task.on('state_changed', s => {
        row.pct = Math.round(100*s.bytesTransferred/s.totalBytes);
        this.rows.update(a=>a.slice());
      });

      await task;
      await this.db.addItem(this.packId, {
        packId: this.packId,
        type: 'loop',
        name: file.name.replace(/\.(wav|aiff|aif|mp3)$/i,''),
        storagePath: path,
        format: file.name.toLowerCase().endsWith('mp3') ? 'mp3' : 'wav'
      });
    }
    this.uploaded.emit();
  }
}

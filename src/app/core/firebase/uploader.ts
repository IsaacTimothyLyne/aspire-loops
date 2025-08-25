// src/app/core/firebase/uploader.ts
import { Injectable, inject, signal } from '@angular/core';
import { Firestore, collection, doc, setDoc } from '@angular/fire/firestore';
import {
  Storage, ref, uploadBytesResumable, getDownloadURL, deleteObject
} from '@angular/fire/storage';
import { getAuth } from '@angular/fire/auth';
import { buildPeaksFromAudioBuffer } from '@app/core/utils/audio-peaks';
import { sha256Str } from '@app/core/utils/hash';
import { v4 as uuid } from 'uuid';

export type UploadStatus = 'running' | 'done' | 'error' | 'cancelled';

export interface FileDoc {
  id: string;
  ownerUid: string;
  name: string;
  size: number;
  contentType: string;
  storagePath: string;

  // audio meta (if decoded)
  duration?: number;
  sampleRate?: number;
  channels?: number;
  peaks?: number[];
  status?: 'in progress' | 'done',
  hash?: string;
  createdAt: number;
  updatedAt: number;
  type?: string;       // e.g. 'audio'
  auto?: {
    bpm?: number | null,
    bpmConfidence?: number | null,
    key?: string | null,          // e.g. "Am"
    keyConfidence?: number | null,
    brightness?: number | null,   // 0..1
    percussive?: number | null,   // 0..1
    loudness?: number | null,     // LUFS-ish or RMS dB
    typeGuess?: string | null,    // "drum-loop" | "melody-loop" | "vocal" | ...
    tags?: string[],              // ["house","bright","groove","drums"]
    analyzedAt?: number
  }

}

export type UploadJob = {
  id: string;
  status: UploadStatus;
  progress: number;     // 0..1
  error?: string;

  // used by the template
  file: File;
  name: string;
  title: string;
  size: number;

  // control
  cancel: () => void;

  // internal
  _storagePath: string;
};

@Injectable({ providedIn: 'root' })
export class Uploader {
  private fs = inject(Firestore);
  private storage = inject(Storage);
  private auth = getAuth();

  /** Active jobs keyed by fileId (handy for rendering progress) */
  jobs = signal<Record<string, UploadJob>>({});

  /** Enqueue a single file; returns job id */
  async enqueue(file: File): Promise<string> {
    const user = this.auth.currentUser;
    if (!user) throw new Error('Not authenticated');
    const ownerUid = user.uid;

    const fileId = uuid();
    const safeName = file.name.replace(/[^\w.\-() ]+/g, '_');
    const storagePath = `users/${ownerUid}/files/${fileId}/${safeName}`;
    const r = ref(this.storage, storagePath);

    // Template-friendly title
    const title = (() => {
      const i = file.name.lastIndexOf('.');
      return i > 0 ? file.name.slice(0, i) : file.name;
    })();

    // Create the resumable upload task
    const task = uploadBytesResumable(r, file, {
      contentType: file.type || 'application/octet-stream',
      customMetadata: { ownerUid, fileId },
    });

    // Create a job row (no Firestore doc yet)
    const job: UploadJob = {
      id: fileId,
      status: 'running',
      progress: 0,
      file,
      name: file.name,
      title,
      size: file.size,
      cancel: () => task.cancel(),
      _storagePath: storagePath,
    };
    this.jobs.update(m => ({ ...m, [fileId]: job }));

    // Compute hash + audio meta in parallel (does NOT touch Firestore)
    const hashPromise = this.hashFile(file);
    const metaPromise = this.decodeMeta(file).catch(() => null);

    task.on(
      'state_changed',
      snap => {
        const pct = snap.totalBytes ? snap.bytesTransferred / snap.totalBytes : 0;
        const j = this.jobs()[fileId];
        if (j) this.jobs.update(m => ({ ...m, [fileId]: { ...j, progress: pct } }));
      },
      async (err) => {
        // Cancel or error → try to remove the object and drop the job row (no Firestore doc was created)
        try { await deleteObject(r); } catch { /* ignore */ }

        const cancelled = (err && String((err as any).code || err.message).includes('canceled')) || task.snapshot?.state === 'canceled';
        const status: UploadStatus = cancelled ? 'cancelled' : 'error';
        const message = String(err?.message || err);

        const j = this.jobs()[fileId];
        if (j) this.jobs.update(m => ({ ...m, [fileId]: { ...j, status, error: message } }));
        this.removeJobSoon(fileId);
      },
      async () => {
        try {
          // Validate object exists & finalize meta
          await getDownloadURL(task.snapshot.ref);
          const [hash, meta] = await Promise.all([hashPromise, metaPromise]);

          // Write the doc only now (upload success)
          const filesCol = collection(this.fs, `users/${ownerUid}/files`);
          const fileRef = doc(filesCol, fileId);

          const docData: FileDoc = {
            id: fileId,
            ownerUid,
            name: file.name,
            size: file.size,
            contentType: file.type || 'application/octet-stream',
            storagePath,
            hash,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            status: 'done',
            type: 'audio',
            ...(meta ? {
              duration: meta.duration,
              sampleRate: meta.sampleRate,
              channels: meta.channels,
              peaks: meta.peaks,
            } : {}),
          };

          await setDoc(fileRef, docData as any);
        } catch (e) {
          // If anything fails here, clean storage so we don't leave orphans
          try { await deleteObject(r); } catch { /* ignore */ }
          const j = this.jobs()[fileId];
          if (j) this.jobs.update(m => ({ ...m, [fileId]: { ...j, status: 'error', error: String(e) } }));
          this.removeJobSoon(fileId);
          return;
        }

        // Success → mark done briefly then hide row
        const j = this.jobs()[fileId];
        if (j) this.jobs.update(m => ({ ...m, [fileId]: { ...j, status: 'done', progress: 1 } }));
        this.removeJobSoon(fileId);
      }
    );

    return fileId;
  }

  /** Convenience: bulk enqueue */
  async enqueueMany(files: FileList | File[]) {
    const arr = Array.from(files as any) as File[];
    const ids: string[] = [];
    for (const f of arr) ids.push(await this.enqueue(f));
    return ids;
  }

  /** Optional external cancel helper */
  cancel(id: string) {
    const j = this.jobs()[id];
    j?.cancel?.();
  }

  // ---- internals ----

  private removeJobSoon(id: string, ms = 800) {
    setTimeout(() => {
      this.jobs.update(m => {
        const { [id]: _, ...rest } = m;
        return rest;
      });
    }, ms);
  }

  private async hashFile(file: File): Promise<string> {
    const buf = await file.arrayBuffer();
    return sha256Str(new Uint8Array(buf));
  }

  private async decodeMeta(file: File): Promise<{
    duration: number;
    sampleRate: number;
    channels: number;
    peaks: number[];
  }> {
    const buf = await file.arrayBuffer();
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const audio = await ctx.decodeAudioData(buf.slice(0)); // Safari-friendly
    const peaks = buildPeaksFromAudioBuffer(audio, 600);
    return {
      duration: audio.duration,
      sampleRate: audio.sampleRate,
      channels: audio.numberOfChannels,
      peaks,
    };
  }
}

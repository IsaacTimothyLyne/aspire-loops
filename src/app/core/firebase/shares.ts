// src/app/core/firebase/db.shares.ts (or merge into your Db)
import { inject, Injectable } from '@angular/core';
import { Firestore, doc, setDoc, getDoc, deleteDoc, collection } from '@angular/fire/firestore';
import { Storage, ref, getDownloadURL } from '@angular/fire/storage';
import { Auth } from '@angular/fire/auth';
import { v4 as uuid } from 'uuid';
import { collectionData, docData } from '@angular/fire/firestore'; // or angular/fire rx if you prefer
import {from, map, Observable, of, switchMap} from 'rxjs';
import {Db} from '@core/firebase/db';

export interface ShareDoc {
  items: any[];
  id: string;
  kind: 'file' | 'pack';
  ownerUid: string;
  fileId?: string;
  packId?: string;
  peaksById?: Record<string, number[]>;  // ← new (for packs)
  title: string;
  url: string;
  mime?: string | null;
  duration?: number | null;
  peaks?: number[] | number[][] | null;   // <-- allow AoC too
  tags?: string[] | null;
  type?: string | null;
  createdAt: number;
  previewPath?: string | null;
  previewReady?: boolean;
}
type PackItemRef = {
  id: string;
  name?: string | null;
  storagePath?: string | null;
};
@Injectable({ providedIn: 'root' })
export class Shares {
  private fs = inject(Firestore);
  private storage = inject(Storage);
  private auth = inject(Auth);
  private db = inject(Db);

  private sharesCol = collection(this.fs, 'shares');

  /** Create (or rotate) a public share for a file */
  async createFileShare(file: {
    id: string; ownerUid: string; storagePath: string;
    title?: string; mime?: string | null; duration?: number | null;
    peaks?: number[] | null; tags?: string[] | null; type?: string | null;
  }): Promise<ShareDoc> {
    const user = this.auth.currentUser;
    if (!user || user.uid !== file.ownerUid) throw new Error('Not authorized');

    const url = await getDownloadURL(ref(this.storage, file.storagePath));
    const id = uuid();
    const share: ShareDoc = {
      id,
      kind: 'file',
      ownerUid: file.ownerUid,
      fileId: file.id,
      title: (file.title || 'Untitled').trim() || 'Untitled',
      url,
      mime: file.mime ?? null,
      duration: file.duration ?? null,
      peaks: file.peaks ?? null,
      tags: file.tags ?? null,
      type: (file.type || 'audio'),
      createdAt: Date.now(),
      items: []
    };
    await setDoc(doc(this.sharesCol, id), share as any);
    return share;
  }
  async createPackShare(p: { id: string; ownerUid: string; title: string }): Promise<ShareDoc> {
    const user = this.auth.currentUser;
    if (!user || user.uid !== p.ownerUid) throw new Error('Not authorized');

    // list items → strongly type to avoid "unknown"
    const packItems = (await this.db.listItems(p.id)) as PackItemRef[];

    const items: Array<{ id: string; title: string; url: string; duration: number | null; mime: string | null }> = [];
    const peaksById: Record<string, number[]> = {};

    for (const it of packItems) {
      // it is PackItemRef now (not unknown)
      const f = await this.db.getFile(p.ownerUid, it.id);
      if (!f) continue;

      const url = await this.db.urlForFile(f);

      // flatten peaks to mono array; DO NOT put inside items[]
      const flatPeaks =
        Array.isArray(f?.peaks)
          ? (Array.isArray((f.peaks as any)[0]) ? (f.peaks as any)[0] : (f.peaks as any))
          : undefined;
      if (flatPeaks && flatPeaks.length) peaksById[f.id] = flatPeaks as number[];

      items.push({
        id: f.id,
        title: f.title || f.name || it.name || 'Untitled',
        url,
        duration: typeof f.duration === 'number' ? f.duration : null,
        mime: f.contentType || null,
      });
    }

    const id = uuid();
    const share: ShareDoc = {
      id,
      kind: 'pack',
      ownerUid: p.ownerUid,
      packId: p.id,
      title: (p.title || 'Untitled').trim() || 'Untitled',
      url: '',                // not used for packs
      items,                  // <- no nested arrays inside
      peaksById,              // <- arrays live here
      createdAt: Date.now(),
    };

    await setDoc(doc(this.sharesCol, id), share as any);
    return share;
  }

  async revokeShare(id: string) {
    const d = await getDoc(doc(this.sharesCol, id));
    if (!d.exists()) return;
    const ownerUid = d.data()?.['ownerUid'];
    const user = this.auth.currentUser;
    if (!user || user.uid !== ownerUid) throw new Error('Not authorized');
    await deleteDoc(doc(this.sharesCol, id));
  }

  /** Create a public share for a PACK, materializing item URLs & peaks */

  share$(id: string) {
    const ref = doc(this.fs, 'shares', id);
    return docData(ref, { idField: 'id' }).pipe(
      switchMap((raw: any) => {
        if (!raw) return of(null);

        // If doc already has a full URL, keep it.
        if (raw.url && /^https?:\/\//i.test(raw.url)) {
          return of(raw as ShareDoc);
        }

        // Otherwise pick preview (if ready) or original path
        const pathLike =
          (raw.previewReady && raw.previewPath) ? raw.previewPath :
            raw.previewPath || raw.storagePath || '';

        if (!pathLike) {
          // Leave url empty and let UI show a friendly error
          return of({ ...raw, url: '' } as ShareDoc);
        }

        return from(this.db.urlFor(String(pathLike))).pipe(
          map((url) => ({ ...raw, url } as ShareDoc))
        );
      })
    );
  }


  // --- packs (minimal) ---
  async createPack(uid: string, data: { title: string; desc?: string | null; tags?: string[]; isPublic?: boolean }) {
    const packId = uuid();
    const col = collection(this.fs, `users/${uid}/packs`);
    const refDoc = doc(col, packId);
    await setDoc(refDoc, {
      id: packId,
      ownerUid: uid,
      title: data.title.trim(),
      desc: data.desc ?? null,
      tags: data.tags ?? [],
      isPublic: !!data.isPublic,
      items: [], // you can push file snapshots in here later
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as any);
    return packId;
  }

  async addFileToPack(uid: string, packId: string, fileSnap: {
    id: string; title: string; storagePath: string; mime?: string | null; duration?: number | null; peaks?: number[] | null;
  }) {
    const refDoc = doc(this.fs, `users/${uid}/packs/${packId}`);
    const snap = { ...fileSnap, addedAt: Date.now() };
    // do a tiny array union patch (or fetch+write full list—depends how your Db is structured)
    // Example using a naive patch (you may prefer transactional update):
    const cur = (await getDoc(refDoc)).data() || {};
    const items = Array.isArray(cur['items']) ? cur['items'] : [];
    items.push(snap);
    await setDoc(refDoc, { ...cur, items, updatedAt: Date.now() } as any);
  }
}

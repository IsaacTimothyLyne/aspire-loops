// src/app/core/firebase/db.ts
import {Injectable, inject} from '@angular/core';
import {
  Firestore,
  collection, doc, setDoc, addDoc, getDoc, getDocs, updateDoc, deleteDoc,
  query, where, orderBy as ob, limit, collectionData
} from '@angular/fire/firestore';
import {
  Storage, ref, getDownloadURL, getBytes, getMetadata, deleteObject, uploadBytes
} from '@angular/fire/storage';
import {firstValueFrom, map, Observable} from 'rxjs';
import {Pack} from '../models/models';
import {Auth} from '@angular/fire/auth';

@Injectable({providedIn: 'root'})
export class Db {
  private fs = inject(Firestore);
  private storage = inject(Storage);

  constructor(private auth: Auth) {
  }

  uid() {
    return this.auth.currentUser?.uid ?? 'dev-user';
  }

  // ---------- files (library) ----------
  filesCol(uid: string) {
    return collection(this.fs, `users/${uid}/files`);
  }

  filesStream(uid: string, take = 200): Observable<any[]> {
    const q = query(
      this.filesCol(uid),
      ob('createdAt', 'desc'),
      limit(take)
    ) as any;

    // Keep only docs that are either missing status (new flow) or explicitly 'done' (old flow)
    return (collectionData(q, {idField: 'id'}) as Observable<any[]>).pipe(
      map(list => list.filter(d => !d.status || d.status === 'done'))
    );
  }

  async initFileDoc(partial: any) {
    const uid = this.uid();
    const refDoc = doc(this.filesCol(uid));
    const fileName: string = partial?.name || 'Untitled';
    const dot = fileName.lastIndexOf('.');
    const title = dot > 0 ? fileName.slice(0, dot) : fileName;
    const ext = dot > 0 ? fileName.slice(dot + 1).toLowerCase() : null;

    const base = {
      id: refDoc.id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      status: 'uploading',
      progress: 0,
      peaks: null,
      title,  // editable title
      ext,    // cached extension
      ...partial,
    };
    await setDoc(refDoc, base as any);
    return {uid, refDoc, data: base};
  }

  async markFileDoc(id: string, patch: any) {
    const uid = this.uid();
    await updateDoc(doc(this.fs, `users/${uid}/files/${id}`), {
      ...patch,
      updatedAt: Date.now(),
    });
  }

  async urlFor(storagePath: string) {
    if (!storagePath) throw new Error('Missing storagePath');
    // Already a full URL? just return it
    if (/^https?:\/\//i.test(storagePath)) return storagePath;
    return getDownloadURL(ref(this.storage, storagePath));
  }

  // src/app/core/firebase/db.ts
  async addFileAsPackItem(packId: string, fileDoc: any) {
    const itemRef = doc(this.fs, `packs/${packId}/items/${fileDoc.id}`);
    await setDoc(itemRef, {
      id: fileDoc.id,
      name: fileDoc.title || fileDoc.name || 'Untitled',
      format: (fileDoc.contentType || '').split('/').pop()?.toUpperCase() || 'WAV',
      bpm: fileDoc.bpm ?? null,
      key: fileDoc.key ?? null,
      tags: fileDoc.tags ?? [],
      storagePath: fileDoc.storagePath,
      createdAt: Date.now(),
    } as any);
    await this.updatePack(packId, {}); // bump updatedAt
  }

  async uploadPackArtwork(packId: string, file: File) {
    const path = `packs/${packId}/artwork${file.type?.includes('png') ? '.png' : '.jpg'}`;
    const r = ref(this.storage, path);
    await uploadBytes(r, file, {contentType: file.type || 'image/jpeg'});
    const url = await getDownloadURL(r);
    await this.updatePack(packId, {artworkPath: path, artworkUrl: url});
    return {path, url};
  }

  async deletePack(packId: string) {
    // 1) delete items subcollection (refs only)
    try {
      const snap = await getDocs(this.itemsCol(packId) as any);
      await Promise.all(
        snap.docs.map(d =>
          deleteDoc(doc(this.fs, `packs/${packId}/items/${d.id}`)).catch(() => void 0)
        )
      );
    } catch (e) {
      console.warn('deletePack: failed deleting items', e);
    }

    // 2) best-effort: remove share docs that reference this pack
    try {
      const sharesCol = collection(this.fs, 'shares');
      const q = query(sharesCol as any, where('packId', '==', packId));
      const sharesSnap = await getDocs(q as any);
      await Promise.all(
        sharesSnap.docs.map(d => deleteDoc(doc(this.fs, 'shares', d.id)).catch(() => void 0))
      );
    } catch (e) {
      console.warn('deletePack: failed cleaning shares', e);
    }

    // 3) delete the pack document itself
    await deleteDoc(doc(this.fs, 'packs', packId));
  }

  async savePackMeta(packId: string, meta: {
    title?: string; isPublic?: boolean;
    producer?: string | null; publisher?: string | null; year?: number | null;
    tags?: string[]; desc?: string | null;
  }) {
    await this.updatePack(packId, meta);
  }

// Add/keep this helper
  async materializePackItems(ownerUid: string, packId: string) {
    type PackItemRow = { id: string; bpm?: number | null; key?: string | null; tags?: string[] };
    const items = await this.listItems(packId) as PackItemRow[];

    const out: Array<{
      id: string; title: string; url: string;
      duration?: number; peaks?: number[] | number[][];
      bpm?: number | null; key?: string | null; tags?: string[];
    }> = [];

    for (const it of items) {
      const f = await this.getFile(ownerUid, it.id);   // <-- no error now
      if (!f) continue;

      const url = await this.urlForFile(f);
      const peaks =
        Array.isArray(f.peaks) && f.peaks.length
          ? (Array.isArray(f.peaks[0]) ? f.peaks : [f.peaks])
          : undefined;

      out.push({
        id: f.id,
        title: f.title || f.name || 'Untitled',
        url,
        duration: f.duration,
        peaks,
        bpm: it.bpm ?? f.bpm ?? null,
        key: it.key ?? f.key ?? null,
        tags: it.tags ?? f.tags ?? [],
      });
    }
    return out;
  }

  /** Prefer the previewPath when available (and marked ready). */
  async urlForFile(f: { storagePath?: string | null; previewPath?: string | null; previewReady?: boolean }) {
    const pick =
      (f.previewReady && f.previewPath) ? f.previewPath :
        f.previewPath || f.storagePath || null;

    if (!pick) throw new Error('No storagePath/previewPath on file');
    return this.urlFor(pick);
  }


  /**
   * Delete both original and preview from Storage, remove pack item references
   * owned by the user, then delete the Firestore file doc.
   */
  async deleteFile(file: { id: string; storagePath?: string; previewPath?: string | null }) {
    const uid = this.uid();
    if (!uid) throw new Error('Not authenticated');

    const fileId = file.id;

    // 1) Load doc for any missing fields
    let {storagePath, previewPath} = file;
    if (!storagePath || previewPath === undefined) {
      const snap = await getDoc(doc(this.fs, `users/${uid}/files/${fileId}`));
      const data = snap.data() as any || {};
      storagePath = storagePath ?? data.storagePath;
      previewPath = previewPath ?? data.previewPath;
    }

    // 2) Best-effort delete Storage blobs
    const del = async (p?: string | null) => {
      if (!p) return;
      try {
        await deleteObject(ref(this.storage, p));
      } catch (e: any) {
        if (e?.code !== 'storage/object-not-found') console.warn('Storage delete failed', p, e);
      }
    };
    await Promise.all([del(storagePath), del(previewPath)]);

    // 3) Best-effort: remove pack item references owned by this user
    try {
      const packsCol = collection(this.fs, 'packs');
      const q = query(packsCol as any, where('ownerUid', '==', uid));
      const packsSnap = await getDocs(q as any);
      await Promise.all(
        packsSnap.docs.map(d =>
          deleteDoc(doc(this.fs, `packs/${d.id}/items/${fileId}`)).catch(() => void 0)
        )
      );
    } catch (e) {
      console.warn('Pack item cleanup failed', e);
    }

    // 4) Delete the Firestore file doc
    await deleteDoc(doc(this.fs, `users/${uid}/files/${fileId}`));
  }

  // Optional: attach a file into a pack as an item (by reference)
  async attachFileToPack(packId: string, file: any) {
    const itemRef = doc(this.fs, `packs/${packId}/items/${file.id}`);
    await setDoc(itemRef, {
      id: file.id,
      name: file.name,
      format: (file.contentType || '').split('/').pop()?.toUpperCase() || 'WAV',
      bpm: null, key: null, tags: [],
      storagePath: file.storagePath,
      createdAt: Date.now(),
    } as any);
  }

  // ---------- packs ----------
  async createPack(title: string, ownerUid = this.uid()) {
    const packs = collection(this.fs, 'packs');
    const refDoc = doc(packs);
    const pack = {
      id: refDoc.id,
      ownerUid,
      title,
      isPublic: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await setDoc(refDoc, pack as any);
    return pack;
  }

  // src/app/core/firebase/db.ts
  async getPack(id: string): Promise<Pack | null> {
    const snap = await getDoc(doc(this.fs, 'packs', id));
    return snap.exists() ? ({id: snap.id, ...(snap.data() as any)} as Pack) : null;
  }


  // Blob helper
  async blobFor(storagePath: string) {
    const r = ref(this.storage, storagePath);
    const [meta, bytes] = await Promise.all([getMetadata(r).catch(() => null), getBytes(r)]);
    return new Blob([bytes], {type: meta?.contentType || 'audio/wav'});
  }

  async updatePack(id: string, patch: any) {
    await updateDoc(doc(this.fs, 'packs', id), {...patch, updatedAt: Date.now()});
  }

  async updateItemTouch(packId: string, itemId: string, patch: any) {
    await updateDoc(doc(this.fs, `packs/${packId}/items/${itemId}`), patch);
    await this.updatePack(packId, {}); // bump updatedAt
  }

  /** One-shot fetch (used by Upload page) */
  async myPacks(uid: string, take = 50): Promise<any[]> {
    return await firstValueFrom(this.myPacksStream(uid, take));
  }

  /** Live list of the user’s packs ordered by last update */
  myPacksStream(uid: string, take = 50): Observable<Pack[]> {
    const packs = collection(this.fs, 'packs');
    const ordered = query(
      packs as any,
      where('ownerUid', '==', uid),
      ob('updatedAt', 'desc'),
      limit(take)
    );
    return collectionData(ordered, {idField: 'id'} as any) as Observable<Pack[]>;
  }

  // ---------- items ----------
  itemsCol(packId: string) {
    return collection(this.fs, `packs/${packId}/items`);
  }

  async addItem(packId: string, item: any) {
    const refDoc = doc(this.itemsCol(packId));
    await setDoc(refDoc, {id: refDoc.id, ...item, createdAt: Date.now()} as any);
  }

  async listItems(packId: string) {
    const snap = await getDocs(this.itemsCol(packId) as any);
    return snap.docs.map(d => d.data());
  }

  async updateItem(packId: string, itemId: string, patch: any) {
    await updateDoc(doc(this.fs, `packs/${packId}/items/${itemId}`), patch);
  }

  itemsStream(packId: string, take = 500) {
    const col = this.itemsCol(packId);
    const q = query(col as any, ob('createdAt', 'asc') as any, limit(take));
    return collectionData(q, {idField: 'id'} as any) as Observable<any[]>;
  }

  async recomputePackStats(packId: string) {
    const items = await this.listItems(packId);
    const bpms = items.map((i: any) => i.bpm).filter((x: any) => typeof x === 'number');
    const keys = Array.from(new Set(items.map((i: any) => i.key).filter(Boolean)));
    const patch: any = {updatedAt: Date.now()};
    if (bpms.length) {
      patch.bpmMin = Math.min(...bpms);
      patch.bpmMax = Math.max(...bpms);
    } else {
      patch.bpmMin = null;
      patch.bpmMax = null;
    }
    patch.keys = keys;
    await updateDoc(doc(this.fs, 'packs', packId), patch);
  }

  // ---------- shares (token-based link doc) ----------
  async createShareLink(packId: string, createdByUid: string, token: string, days = 14) {
    const shares = collection(this.fs, 'shareLinks');
    const data = {
      packId,
      createdByUid,
      tokenHash: token,                 // consider hashing
      expiresAt: Date.now() + days * 86400000,
      allowComments: true,
      allowZip: true,
      downloads: 0,
      createdAt: Date.now(),
    };
    const refDoc = await addDoc(shares as any, data as any);
    return refDoc.id;
  }

  // src/app/core/firebase/db.ts
  async getFile(ownerUid: string, fileId: string) {
    const snap = await getDoc(doc(this.fs, `users/${ownerUid}/files/${fileId}`));
    return snap.exists() ? {id: snap.id, ...(snap.data() as any)} : null;
  }

}

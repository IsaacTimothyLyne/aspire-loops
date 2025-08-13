import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection, doc, setDoc, addDoc, getDoc, getDocs, updateDoc,
  query, where, orderBy, limit, collectionData
} from '@angular/fire/firestore';
import { Storage, ref, getDownloadURL } from '@angular/fire/storage';
import {catchError, firstValueFrom, map, Observable} from 'rxjs';
import {Pack} from './models';

@Injectable({ providedIn: 'root' })
export class Db {
  private fs = inject(Firestore);
  private storage = inject(Storage);

  // ---------- packs ----------
  async createPack(title: string, ownerUid = 'dev-user') {
    const packs = collection(this.fs, 'packs');               // AngularFire collection()
    const refDoc = doc(packs);                                // AngularFire doc()
    const pack = { id: refDoc.id, ownerUid, title, isPublic: false, createdAt: Date.now(), updatedAt: Date.now() };
    await setDoc(refDoc, pack as any);
    return pack;
  }

  async getPack(id: string) {
    const snap = await getDoc(doc(this.fs, 'packs', id));
    return snap.exists() ? (snap.data() as any) : null;
  }

  async updatePack(id: string, patch: any) {
    await updateDoc(doc(this.fs, 'packs', id), { ...patch, updatedAt: Date.now() });
  }
  /** One-shot fetch for convenience (used by Upload page) */
  async myPacks(uid: string, take = 50): Promise<any[]> {
    return await firstValueFrom(this.myPacksStream(uid, take));
  }
  /** Live list of the user’s packs ordered by last update */
  myPacksStream(uid: string, take = 50): Observable<Pack[]> {
    const packs = collection(this.fs, 'packs');

    const ordered = query(
      packs as any,
      where('ownerUid', '==', uid),
      orderBy('updatedAt', 'desc'),
      limit(take)
    );

    return collectionData(ordered, { idField: 'id' } as any) as Observable<Pack[]>;
  }



  // ---------- items ----------
  itemsCol(packId: string) {
    return collection(this.fs, `packs/${packId}/items`);
  }

  async addItem(packId: string, item: any) {
    const refDoc = doc(this.itemsCol(packId));
    await setDoc(refDoc, { id: refDoc.id, ...item, createdAt: Date.now() } as any);
  }

  async listItems(packId: string) {
    const snap = await getDocs(this.itemsCol(packId) as any);
    return snap.docs.map(d => d.data());
  }

  async updateItem(packId: string, itemId: string, patch: any) {
    await updateDoc(doc(this.fs, `packs/${packId}/items/${itemId}`), patch);
  }

  async urlFor(storagePath: string) {
    return await getDownloadURL(ref(this.storage, storagePath));
  }

  // ---------- shares ----------
  async createShareLink(packId: string, createdByUid: string, token: string, days = 14) {
    const shares = collection(this.fs, 'shareLinks');
    const data = {
      packId, createdByUid,
      tokenHash: token,                        // replace with sha256 if you want
      expiresAt: Date.now() + days * 86400000,
      allowComments: true, allowZip: true,
      downloads: 0, createdAt: Date.now(),
    };
    const refDoc = await addDoc(shares as any, data as any);
    return refDoc.id;
  }
}

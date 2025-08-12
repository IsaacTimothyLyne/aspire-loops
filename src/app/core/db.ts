import { Injectable, inject } from '@angular/core';
import {
  Firestore, collection, doc, setDoc, addDoc,
  getDoc, getDocs                       // ✅ add these
} from '@angular/fire/firestore';
import { sha256 } from './hash';

@Injectable({ providedIn: 'root' })
export class Db {
  private fs = inject(Firestore);

  packsCol = collection(this.fs, 'packs');
  itemsCol = (packId: string) => collection(this.fs, `packs/${packId}/items`);

  async createPack(title: string, ownerUid = 'dev-user') {
    const ref = doc(this.packsCol);
    const pack = { id: ref.id, ownerUid, title, isPublic: false, createdAt: Date.now(), updatedAt: Date.now() };
    await setDoc(ref, pack as any);
    return pack;
  }

  async addItem(packId: string, item: any) {
    const ref = doc(this.itemsCol(packId));
    await setDoc(ref, { id: ref.id, ...item, createdAt: Date.now() } as any);
  }

  // ✅ READ: get a single pack
  async getPack(id: string) {
    const snap = await getDoc(doc(this.packsCol, id));
    return snap.exists() ? (snap.data() as any) : null;
  }

  // ✅ READ: list items in a pack
  async listItems(packId: string) {
    const snap = await getDocs(this.itemsCol(packId));
    return snap.docs.map(d => d.data());
  }

  // Share link
  async createShareLink(packId: string, createdByUid: string, token: string, days = 14) {
    const shares = collection(this.fs, 'shareLinks');
    const data = {
      packId, createdByUid,
      tokenHash: await sha256(token),
      expiresAt: Date.now() + days * 86400000,
      allowComments: true, allowZip: true,
      downloads: 0, createdAt: Date.now(),
    };
    const ref = await addDoc(shares, data as any);
    return ref.id;
  }
}

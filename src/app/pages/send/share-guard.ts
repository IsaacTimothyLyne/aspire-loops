import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';
import { sha256 } from '../../core/hash';

export const shareGuard: CanActivateFn = async (route) => {
  const fs = inject(Firestore), router = inject(Router);
  const shareId = route.paramMap.get('shareId')!;
  const token = route.queryParamMap.get('token') || '';
  const snap = await getDoc(doc(fs, 'shareLinks', shareId));
  if (!snap.exists()) return router.parseUrl('/expired');

  const data: any = snap.data();
  const ok = (await sha256(token)) === data['tokenHash'] && Date.now() < data['expiresAt'];
  return ok ? true : router.parseUrl('/expired');
};

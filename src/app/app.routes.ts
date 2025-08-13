import { Routes } from '@angular/router';
import {shareGuard} from './pages/send/share-guard';
import {authGuard} from './core/auth-guard';
import {verifiedGuard} from './core/veified-guard';

export const routes: Routes = [
  { path: '', loadComponent: ()=> import('./pages/landing/landing').then(m=>m.Landing)},
  { path: 'auth', loadComponent: () => import('./pages/auth/auth').then(m => m.Auth) },
  { path: 'upload', loadComponent: () => import('./pages/upload/upload').then(m => m.Upload) },

  { path: 'make', canActivate: [authGuard, verifiedGuard], loadComponent: () =>  import('./pages/make/dashboard/dashboard') .then(m => m.Dashboard)},
  { path: 'pack/:id', canActivate: [authGuard, verifiedGuard], loadComponent: () => import('./pages/make/pack/pack').then(m => m.Pack)},
  { path: 'pack/new', canActivate: [authGuard, verifiedGuard], loadComponent: () => import('./pages/make/pack/pack-new/pack-new').then(m => m.PackNew) },
  { path: 's/:shareId', loadComponent: () => import('./pages/send/share-view/share-view').then(m => m.ShareView)},
  { path: 'r/:reviewId', loadComponent: () => import('./pages/review/deliverables/deliverables').then(m => m.Deliverables)},
  { path: 's/:shareId', canActivate: [shareGuard],
    loadComponent: () => import('./pages/send/share-view/share-view').then(m => m.ShareView) },

  { path: '**', redirectTo: 'make' }
];

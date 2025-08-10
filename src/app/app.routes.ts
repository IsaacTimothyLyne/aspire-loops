import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'make', pathMatch: 'full' },
  { path: 'make', loadComponent: () =>  import('./pages/make/dashboard/dashboard') .then(m => m.Dashboard)},
  { path: 'pack/:id', loadComponent: () => import('./pages/make/pack/pack').then(m => m.Pack)},
  { path: 's/:shareId', loadComponent: () => import('./pages/send/share-view/share-view').then(m => m.ShareView)},
  { path: 'r/:reviewId', loadComponent: () => import('./pages/review/deliverables/deliverables').then(m => m.Deliverables)},
  { path: '**', redirectTo: 'make' }
];

import {Routes} from '@angular/router';
import {VerifiedGuard} from '@core/guards/verified-guard';
import {AppShell} from './shell/app-shell/app-shell';
import {AuthGuard} from '@angular/fire/auth-guard';

export const routes: Routes = [
  // -------- public routes (no shell) --------
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('@features/landing/landing').then(m => m.Landing),
    title: 'AspireLoops'
  },
  {
    path: 'auth',
    loadComponent: () =>
      import('@features/auth/auth').then(m => m.Auth),
    title: 'Sign in'
  },
  {
    path: 'verify',
    loadComponent: () =>
      import('@features/auth/verify/verify').then(m => m.Verify),
    title: 'Verify your email'
  },

  // -------- app (protected) routes with persistent shell --------
  {
    path: 'app',
    component: AppShell,
    canActivate: [AuthGuard, VerifiedGuard],
    children: [
      {
        path: 'dashboard',
        loadComponent: () =>
          import('@features/dashboard/dashboard').then(m => m.Dashboard),
        title: 'Dashboard'
      },
      {
        path: 'library', // user’s big file library
        loadComponent: () =>
          import('@features/library/library').then(m => m.Library),
        title: 'Library'
      },
      {
        path: 'pack/new',
        loadComponent: () =>
          import('@features/packs/pack-new/pack-new').then(m => m.PackNew),
        title: 'New Pack'
      },
      {
        path: 'packs/:id',
        loadComponent: () => import('@features/packs/pack-detail/pack-detail').then(m => m.PackDetail),
        title: 'Pack',
      },

      { path: '', pathMatch: 'full', redirectTo: 'dashboard' }
    ]
  },
// src/app/app.routes.ts (add one)
  {
    path: 's/:id',
    loadComponent: () => import('@features/share-page/share-page').then(m => m.SharePage),
  },
  // -------- fallback --------
  { path: '**', redirectTo: '' }
];

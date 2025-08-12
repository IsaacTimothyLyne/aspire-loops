import { Component, inject, signal } from '@angular/core';
import { Db } from '../../../../core/db';
import {FormsModule} from '@angular/forms';
import {NgIf} from '@angular/common';

@Component({
  standalone: true,
  templateUrl: './create-share.html',
  imports: [
    FormsModule,
    NgIf
  ]
})
export class CreateShareComponent {
  private db = inject(Db);
  packId = '';
  url = signal<string>('');

  async make() {
    const token = crypto.randomUUID().replace(/-/g,'');
    const id = await this.db.createShareLink(this.packId, 'TEMP-uid', token, 14);
    this.url.set(`${location.origin}/s/${id}?token=${token}`);
  }
}

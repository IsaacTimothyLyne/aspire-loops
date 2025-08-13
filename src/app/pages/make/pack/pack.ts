import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Auth } from '@angular/fire/auth';
import { Db} from '../../../core/db';
import { UploaderComponent} from '../../../components/uploader/uploader';
import {FormsModule} from '@angular/forms';
import {ActivatedRoute, RouterLink} from '@angular/router';

@Component({
  standalone: true,
  selector: 'app-pack',
  imports: [CommonModule, UploaderComponent, FormsModule, RouterLink],
  templateUrl: './pack.html'
})
export class Pack {
  private route = inject(ActivatedRoute);
  private db = inject(Db);

  packId = signal<string>('');
  title = signal('New Pack');
  createdAt = signal<Date>(new Date());
  items = signal<any[]>([]);

  async ngOnInit() {
    this.packId.set(this.route.snapshot.paramMap.get('id')!);
    await this.refresh();
  }

  async refresh() {
    const pack = await this.db.getPack(this.packId());
    if (pack) { this.title.set(pack.title); this.createdAt.set(new Date(pack.createdAt)); }
    this.items.set(await this.db.listItems(this.packId()));
  }

  onUploaded(){ this.refresh(); }
}

import {Component, inject} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {Db} from '../../../../core/db'
import {Router, RouterLink} from '@angular/router';

@Component({
  selector: 'app-pack-new',
  imports: [
    FormsModule,
    RouterLink
  ],
  templateUrl: './pack-new.html',
  styleUrl: './pack-new.scss'
})
export class PackNew {
  private db = inject(Db);
  private router = inject(Router);
  title = 'New Pack';

  async create(){
    const p = await this.db.createPack(this.title);
    await this.router.navigate(['/pack', p.id]);
  }
}

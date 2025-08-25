import {
  Component, EventEmitter, Input, Output, inject,
  signal, effect, computed, ViewChild, ElementRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Uploader, UploadJob } from '@app/core/firebase/uploader';

@Component({
  standalone: true,
  selector: 'app-uploader',
  imports: [CommonModule],
  templateUrl: './uploader.html',
  styleUrls: ['./uploader.scss'],
})
export class UploaderComponent {
  private up = inject(Uploader);

  /** Accept clause for the hidden <input type="file"> */
  @Input() accept = 'audio/*';

  /** Notify parent whenever at least one file finished */
  @Output() uploaded = new EventEmitter<void>();

  /** Hidden chooser (for keyboard + click) */
  @ViewChild('chooser', { static: true }) chooser!: ElementRef<HTMLInputElement>;

  /** Hover state for drop styling */
  isHover = signal(false);

  /** IDs entering the "fade out" animation */
  finishing = signal<Record<string, true>>({});

  /** Ack which jobs already fired uploaded() */
  private acknowledged = new Set<string>();

  /** Source map from the service */
  private jobsMap = computed(() => this.up.jobs());

  /** Only show rows that aren't finished, plus those currently fading out */
  visibleJobs = computed<UploadJob[]>(() => {
    const fading = this.finishing();
    const all = Object.values(this.jobsMap());
    return all.filter(j =>
      j && ((j.status !== 'done' && j.status !== 'cancelled') || !!fading[j.id])
    );
  });

  /** Count actively transferring rows */
  uploadingCount = computed(() => this.visibleJobs().filter(j => j.status === 'running').length);

  constructor() {
    // Emit uploaded() exactly once per completed job
    effect(() => {
      const map = this.jobsMap();
      for (const [id, j] of Object.entries(map)) {
        if (j?.status === 'done' && !this.acknowledged.has(id)) {
          this.acknowledged.add(id);
          this.uploaded.emit();
        }
      }
    });

    // When a job becomes done/cancelled, keep it briefly for a fade-out
    effect(() => {
      const map = this.jobsMap();
      for (const [id, j] of Object.entries(map)) {
        if (!j) continue;
        if ((j.status === 'done' || j.status === 'cancelled') && !this.finishing()[id]) {
          this.finishing.update(m => ({ ...m, [id]: true }));
          window.setTimeout(() => {
            this.finishing.update(m => {
              const { [id]: _, ...rest } = m;
              return rest;
            });
          }, 650); // keep in sync with CSS animation
        }
      }
    });
  }

  // --------------- UI events ----------------

  pick() { this.chooser?.nativeElement?.click(); }

  async onPick(e: Event) {
    const input = e.target as HTMLInputElement;
    if (!input.files?.length) return;
    await this.up.enqueueMany(input.files);
    input.value = ''; // reset for next selection
  }

  async onDrop(e: DragEvent) {
    e.preventDefault();
    this.isHover.set(false);
    if (!e.dataTransfer?.files?.length) return;
    await this.up.enqueueMany(e.dataTransfer.files);
  }

  onDragOver(e: DragEvent) { e.preventDefault(); this.isHover.set(true); }
  onDragLeave(_e: DragEvent) { this.isHover.set(false); }

  // --------------- actions ----------------

  cancel(id: string) {
    // Prefer service method if present; fall back to job.cancel()
    const svc: any = this.up as any;
    if (typeof svc.cancel === 'function') { svc.cancel(id); return; }
    const job = this.jobsMap()[id];
    job?.cancel?.();
  }

  cancelAll() {
    for (const j of this.visibleJobs()) {
      if (j.status === 'running') this.cancel(j.id);
    }
  }

  /** helper for template if needed elsewhere */
  jobs(): UploadJob[] { return this.visibleJobs(); }
}

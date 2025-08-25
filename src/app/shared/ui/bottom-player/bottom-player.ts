// bottom-player.ts
import { Component, ElementRef, ViewChild, inject, OnDestroy, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AudioPlayer } from '@app/core/audio/audio-player';

@Component({
  standalone: true,
  selector: 'app-bottom-player',
  imports: [CommonModule],
  templateUrl: './bottom-player.html',
  styleUrls: ['./bottom-player.scss'],
})
export class BottomPlayer implements AfterViewInit, OnDestroy {
  private audio = inject(AudioPlayer);

  @ViewChild('wave', { static: false }) waveEl?: ElementRef<HTMLElement>;

  async ngAfterViewInit() {
    const el = this.waveEl?.nativeElement;
    if (!el) return; // guard against rare timing/SSR cases

    const varVal = getComputedStyle(el).getPropertyValue('--wave-h').trim();
    const cssH = varVal.endsWith('px') ? parseFloat(varVal) : NaN;
    const h = Number.isFinite(cssH) ? cssH : (Math.round(el.getBoundingClientRect().height) || 56);

    await this.audio.attach(el, { height: h });
  }

  // expose signals
  curr = this.audio.current;
  playing = this.audio.isPlaying;
  progress = this.audio.progress;
  error = this.audio.error;

  toggle() { this.audio.toggle(); }
  next()   { this.audio.next(); }
  prev()   { this.audio.prev(); }

  ngOnDestroy() {
    // keep global player alive; call this.audio.destroy() if you want teardown on route change
  }
}

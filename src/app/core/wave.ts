// core/wave.ts
import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class Wave {
  private ws: any | null = null;

  async ensure(container: HTMLElement) {
    if (!this.ws) {
      const WaveSurfer = (await import('wavesurfer.js')).default;
      this.ws = WaveSurfer.create({
        container,
        height: 64,
        waveColor: '#9aa0a6',
        progressColor: '#ffffff',
        cursorColor: '#ffffff',
        barWidth: 2,
        barGap: 1,
      });
    }
    return this.ws;
  }

  async load(container: HTMLElement, blob: Blob) {
    const ws = await this.ensure(container);
    try { ws.empty?.(); } catch {}

    await new Promise<void>((resolve, reject) => {
      const onReady = () => { ws.un('ready', onReady); ws.un('error', onErr); resolve(); };
      const onErr = (e: any) => { ws.un('ready', onReady); ws.un('error', onErr); reject(e); };
      ws.on('ready', onReady);
      ws.on('error', onErr);
      // Prefer loadBlob (no network)
      if (ws.loadBlob) ws.loadBlob(blob);
      else {
        const url = URL.createObjectURL(blob);
        ws.on('ready', () => URL.revokeObjectURL(url));
        ws.load(url);
      }
    });
  }

  playPause() { this.ws?.playPause(); }
  stop() { this.ws?.stop(); }
}

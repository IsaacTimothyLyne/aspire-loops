import { Injectable } from '@angular/core';

// Relaxed surface so TS accepts WS's generic event signatures
type Ws = {
  load: (...args: any[]) => Promise<void> | void;
  loadBlob?: (blob: Blob) => Promise<void> | void;
  empty?: () => void;
  destroy?: () => void;
  on: (...args: any[]) => any;
  un?: (...args: any[]) => any;
};

@Injectable({ providedIn: 'root' })
export class Wave {
  private ws: Ws | null = null;
  private container: HTMLElement | null = null;

  private async ensure(container: HTMLElement) {
    if (typeof window === 'undefined') return null;

    if (this.ws && this.container === container) return this.ws;

    if (this.ws && this.container && this.container !== container) {
      try { this.ws.destroy?.(); } catch {}
      this.ws = null;
    }

    const WaveSurfer = (await import('wavesurfer.js')).default;
    const created = WaveSurfer.create({
      container,
      height: 64,
      waveColor: '#9aa0a6',
      progressColor: '#ffffff',
      cursorColor: '#ffffff',
      barWidth: 2,
      barGap: 1,
    });

    this.ws = created as unknown as Ws; // <-- assert to relaxed shape
    this.container = container;
    return this.ws;
  }

  async load(container: HTMLElement, blob: Blob): Promise<void> {
    const ws = await this.ensure(container);
    if (!ws) return;

    try { ws.empty?.(); } catch {}

    await new Promise<void>((resolve, reject) => {
      const onReady = () => { off(); resolve(); };
      const onErr   = (e: any) => { off(); reject(e); };
      const off = () => {
        try { ws.un?.('ready', onReady); } catch {}
        try { ws.un?.('error', onErr); } catch {}
      };

      ws.on('ready', onReady);
      ws.on('error', onErr);

      if (ws.loadBlob) {
        ws.loadBlob(blob);
      } else {
        const url = URL.createObjectURL(blob);
        ws.on('ready', () => URL.revokeObjectURL(url));
        (ws.load as any)(url);
      }
    });
  }

  playPause() { (this.ws as any)?.playPause?.(); }
  stop()      { this.ws?.destroy?.(); this.ws = null; this.container = null; }
}

import {Injectable, signal} from '@angular/core';

export type Track = {
  id?: string;
  src: string;
  title?: string;
  mime?: string;
  duration?: number;
  peaks?: number[] | (number[] | Float32Array)[]; // allow array-of-channels too
};

// Relaxed surface for WS v6/v7
type Ws = {
  load: (...args: any[]) => Promise<void> | void;
  empty?: () => void;
  destroy?: () => void;
  isPlaying?: () => boolean;
  play?: () => Promise<void> | void;
  pause?: () => void;
  stop?: () => void;
  seekTo?: (fraction: number) => void;
  getDuration?: () => number;
  getCurrentTime?: () => number;
  setVolume?: (v: number) => void;
  setPlaybackRate?: (r: number) => void;
  on: (...args: any[]) => any;
  un?: (...args: any[]) => any;
};

@Injectable({providedIn: 'root'})
export class AudioPlayer {
  private ws: Ws | null = null;
  private container: HTMLElement | null = null;

  // queue state
  private queue: Track[] = [];
  private index = -1;
  private pending?: { track: Track; autoplay: boolean };

  // signals
  current = signal<Track | null>(null);
  isPlaying = signal(false);
  progress = signal(0);
  error = signal<string | null>(null);
  volume = signal(1);
  rate = signal(1);

  // ---------- attach / lifecycle ----------
  async attach(container: HTMLElement, opts?: Partial<{
    height: number;
    waveColor: string;
    progressColor: string;
    cursorColor: string;
    barWidth: number;
    barGap: number;
  }>) {
    if (typeof window === 'undefined') return;
    if (this.container === container && this.ws) return;

    // move instance if attaching to a new container
    if (this.ws && this.container && this.container !== container) {
      try {
        this.ws.destroy?.();
      } catch {
      }
      this.ws = null;
    }

    const WaveSurfer = (await import('wavesurfer.js')).default;
    const created = WaveSurfer.create({
      container,
      height: opts?.height ?? 56,
      waveColor: opts?.waveColor ?? '#9aa0a6',
      progressColor: opts?.progressColor ?? '#fff',
      cursorColor: opts?.cursorColor ?? '#fff',
      barWidth: opts?.barWidth ?? 2,
      barGap: opts?.barGap ?? 1,
    });

    const ws = created as unknown as Ws;

    const update = () => {
      const dur = ws.getDuration?.() || 1;
      const cur = ws.getCurrentTime?.() || 0;
      this.progress.set(Math.min(1, Math.max(0, cur / dur)));
    };

    ws.on('ready', () => {
      const dur = ws.getDuration?.() ?? 0;
      this.current.update(t => (t ? {...t, duration: t?.duration ?? dur} : t));
      this.error.set(null);
      update();
    });

    ws.on('error', (e: any) => {
      const msg = typeof e === 'string' ? e : e?.message || 'Unknown audio error';
      this.error.set(msg);
      console.error('WaveSurfer error:', e);
    });

    ws.on('play', () => this.isPlaying.set(true));
    ws.on('pause', () => this.isPlaying.set(false));
    ws.on('finish', () => {
      this.isPlaying.set(false);
      this.progress.set(1);
      this.next(true); // auto-advance
    });
    ws.on('interaction', update);
    ws.on('audioprocess', update);

    try {
      ws.setVolume?.(this.volume());
    } catch {
    }
    try {
      ws.setPlaybackRate?.(this.rate());
    } catch {
    }

    this.ws = ws;
    this.container = container;

    // If something asked to load before attach finished
    if (this.pending) {
      const {track, autoplay} = this.pending;
      this.pending = undefined;
      await this.loadTrack(track, autoplay);
    }
  }

  destroy() {
    try {
      this.ws?.destroy?.();
    } catch {
    }
    this.ws = null;
    this.container = null;
    this.queue = [];
    this.index = -1;
    this.isPlaying.set(false);
    this.progress.set(0);
    this.current.set(null);
    this.error.set(null);
  }

  // ---------- queue API ----------
  async setQueue(tracks: Track[], startIndex = 0) {
    this.queue = Array.isArray(tracks) ? [...tracks] : [];
    this.index = Math.min(Math.max(0, startIndex), Math.max(0, this.queue.length - 1));
    if (this.queue.length) {
      await this.setTrack(this.queue[this.index], false); // don’t autoplay until user hits play
    } else {
      this.current.set(null);
    }
  }

  async playIndex(i: number) {
    if (!this.queue.length) return;
    this.index = Math.min(Math.max(0, i), this.queue.length - 1);
    await this.setTrack(this.queue[this.index], true);
  }

  prev() {
    if (!this.queue.length) return;
    const i = Math.max(0, this.index - 1);
    void this.playIndex(i);
  }

  next(auto = false) {
    if (!this.queue.length) return;
    const last = this.queue.length - 1;
    if (this.index >= last) {
      // end of list
      if (!auto) this.pause(); // manual "next" at end just pauses
      return;
    }
    void this.playIndex(this.index + 1);
  }


// in loadTrack(...) do the same

  async setTrack(track: Track, autoplay = true) {
    if (!this.ws) return;
    this.error.set(null);
    this.progress.set(0);
    this.current.set(track);

    const peaksAoC = this.normalizePeaks(track.peaks);
    const dur = typeof track.duration === 'number' && track.duration > 0 ? track.duration : undefined;

    try { this.ws?.empty?.(); } catch {}

    await this.wavesurferLoad(this.ws!, track.src, peaksAoC, dur);
    if (autoplay) await this.play();
  }


  private async loadTrack(track: Track, autoplay: boolean) {
    const ws = this.ws!;
    this.error.set(null);
    this.progress.set(0);
    this.current.set(track);

    try {
      try {
        ws.empty?.();
      } catch {
      }

      // Normalize peaks into array-of-channels if provided
      const rawPeaks = track.peaks as any;
      const hasPeaks = Array.isArray(rawPeaks) && rawPeaks.length > 0;
      const peaksAoC: (number[] | Float32Array)[] | undefined =
        hasPeaks
          ? (Array.isArray(rawPeaks[0]) ? rawPeaks : [rawPeaks])
          : undefined;

      const dur = typeof track.duration === 'number' && track.duration > 0 ? track.duration : undefined;

      if (peaksAoC) {
        try {
          await (ws.load as any)(track.src, {peaks: peaksAoC, ...(dur ? {duration: dur} : {})});
        } catch {
          await (ws.load as any)(track.src, peaksAoC, dur);
        }
      } else {
        await (ws.load as any)(track.src);
      }

      if (autoplay) await this.play();
    } catch (err) {
      const msg = (err as any)?.message || String(err);
      this.error.set(msg);
      console.error('wavesurfer load failed:', err);
    }
  }

  async play() {
    try {
      await this.ws?.play?.();
    } catch (e) {
      const msg = (e as any)?.message || String(e);
      this.error.set(msg);
      console.warn('Playback blocked by browser policy:', e);
    }
  }

  pause() {
    this.ws?.pause?.();
  }

  stop() {
    this.ws?.stop?.();
  }

  toggle() {
    this.ws?.isPlaying?.() ? this.pause() : this.play();
  }

  seek(fraction: number) {
    this.ws?.seekTo?.(Math.max(0, Math.min(1, fraction)));
  }

  setVolume(v: number) {
    const x = Math.max(0, Math.min(1, v));
    this.volume.set(x);
    try {
      this.ws?.setVolume?.(x);
    } catch {
    }
  }

  setRate(r: number) {
    const x = Math.max(0.5, Math.min(2, r));
    this.rate.set(x);
    try {
      this.ws?.setPlaybackRate?.(x);
    } catch {
    }
  }

  // inside AudioPlayer
  private normalizePeaks(input: Track['peaks']): (number[] | Float32Array)[] | undefined {
    if (!input) return undefined;
    if (Array.isArray((input as any)[0])) return input as any;
    if (Array.isArray(input) || ArrayBuffer.isView(input)) return [input as any];
    return undefined;
  }

  private wavesurferLoad = async (ws: Ws, url: string,
                                  peaks?: (number[] | Float32Array)[] | undefined,
                                  duration?: number | undefined) => {
    const arity = (ws.load as Function).length; // v6≈3, v7≈1
    if (arity >= 2) {
      if (peaks && peaks.length) await (ws.load as any)(url, peaks, duration);
      else await (ws.load as any)(url);
    } else {
      const hasOpts = (peaks && peaks.length) || duration;
      if (hasOpts) await (ws.load as any)(url, {peaks, ...(duration ? {duration} : {})});
      else await (ws.load as any)(url);
    }
  };

}

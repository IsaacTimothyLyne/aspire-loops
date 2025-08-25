// utils/audio-peaks.ts
export function computePeaks(buffer: AudioBuffer, bins = 600) {
  // mono
  const N = buffer.length;
  const ch = buffer.numberOfChannels > 1
    ? mixToMono(buffer) : buffer.getChannelData(0);

  const hop = Math.ceil(ch.length / bins);
  const minmax = new Float32Array(bins * 2);
  let w = 0;
  for (let i = 0; i < bins; i++) {
    const start = i * hop, end = Math.min(ch.length, start + hop);
    let min = 1, max = -1;
    for (let j = start; j < end; j++) {
      const v = ch[j];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    minmax[w++] = min; minmax[w++] = max;
  }
  // quantize -1..1 → 0..255
  const peaks8 = new Uint8Array(minmax.length);
  for (let i = 0; i < minmax.length; i++)
    peaks8[i] = Math.round((minmax[i] + 1) * 127.5);

  return { peaks8, duration: buffer.duration };
}

function mixToMono(buf: AudioBuffer) {
  const out = new Float32Array(buf.length);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) out[i] += d[i] / buf.numberOfChannels;
  }
  return out;
}

export const encodeU8 = (u8: Uint8Array) =>
  btoa(String.fromCharCode(...u8));
export const decodeU8 = (b64: string) =>
  Uint8Array.from(atob(b64), c => c.charCodeAt(0));
/**
 * Build normalized peak array [0..1] from mono samples.
 * Buckets ~ how many bars you want to render.
 */
export function buildPeaks(samples: Float32Array, buckets = 400): number[] {
  const n = samples.length;
  if (!n || buckets <= 0) return [];

  const windowSize = Math.ceil(n / buckets);
  const peaks: number[] = new Array(Math.min(buckets, Math.ceil(n / windowSize)));

  let globalMax = 0;
  // first pass: per-bucket absolute max + track global max
  for (let b = 0; b < peaks.length; b++) {
    const start = b * windowSize;
    const end = Math.min(start + windowSize, n);
    let max = 0;
    for (let i = start; i < end; i++) {
      const v = Math.abs(samples[i]);
      if (v > max) max = v;
    }
    peaks[b] = max;
    if (max > globalMax) globalMax = max;
  }

  // normalize to 0..1 (avoid div-by-zero)
  if (globalMax > 0) {
    for (let i = 0; i < peaks.length; i++) peaks[i] = peaks[i] / globalMax;
  }

  return peaks;
}

/**
 * Convenience: build peaks directly from an AudioBuffer.
 * Downmixes to mono (L+R)/2 if needed.
 */
export function buildPeaksFromAudioBuffer(buf: AudioBuffer, buckets = 400): number[] {
  const ch0 = buf.getChannelData(0);
  let mono: Float32Array;

  if (buf.numberOfChannels > 1) {
    const ch1 = buf.getChannelData(1);
    const len = Math.min(ch0.length, ch1.length);
    mono = new Float32Array(len);
    for (let i = 0; i < len; i++) mono[i] = (ch0[i] + ch1[i]) * 0.5;
  } else {
    mono = ch0;
  }

  return buildPeaks(mono, buckets);
}

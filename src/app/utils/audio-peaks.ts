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

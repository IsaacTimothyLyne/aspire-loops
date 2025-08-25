// Lightweight key detection using:
// - Harmonic Product Spectrum to find likely fundamentals
// - Accumulate pitch-class (chroma) energy over frames
// - Krumhansl-Schmuckler template match for major/minor

import { fft, util as fftUtil } from 'fft-js';

const A4 = 440;

function hann(N: number) {
  const w = new Float32Array(N);
  for (let n = 0; n < N; n++) w[n] = 0.5 * (1 - Math.cos((2 * Math.PI * n) / (N - 1)));
  return w;
}

function freqToMidi(f: number) {
  return Math.round(69 + 12 * Math.log2(f / A4));
}

function rotate<T>(arr: T[], n: number) {
  const k = ((n % arr.length) + arr.length) % arr.length;
  return arr.slice(k).concat(arr.slice(0, k));
}

const MAJOR_PROFILE = [6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88];
const MINOR_PROFILE = [6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17];

const PITCHES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

function normalize(v: number[]) {
  const sum = Math.sqrt(v.reduce((a, b) => a + b * b, 0)) || 1;
  return v.map(x => x / sum);
}

function corr(a: number[], b: number[]) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function hps(mag: Float32Array, harmonics = 5) {
  const L = Math.floor(mag.length / harmonics);
  const out = new Float32Array(L);
  for (let i = 0; i < L; i++) {
    let p = mag[i] || 1e-9;
    for (let h = 2; h <= harmonics; h++) p *= mag[i * h] || 1e-9;
    out[i] = p;
  }
  return out;
}

export function estimateKeyHPS(
  data: Float32Array,
  sampleRate: number,
  opts: { frameSize?: number; hopSize?: number; minFreq?: number; maxFreq?: number } = {}
): { key: string | null; mode: 'major'|'minor'|null; conf: number } {
  const N = opts.frameSize ?? 4096;
  const H = opts.hopSize ?? 2048;
  const minF = opts.minFreq ?? 50;
  const maxF = opts.maxFreq ?? 1400;

  if (data.length < N) return { key: null, mode: null, conf: 0 };

  const w = hann(N);
  const maxFrames = Math.min(20, Math.floor((data.length - N) / H) + 1); // cap work

  const chroma = new Array<number>(12).fill(0);

  for (let f = 0; f < maxFrames; f++) {
    const start = f * H;
    const frame = new Array<number>(N);
    for (let i = 0; i < N; i++) frame[i] = (data[start + i] || 0) * w[i];

    const ph = fft(frame);
    const mag = fftUtil.fftMag(ph);         // length N
    const mags = new Float32Array(mag.slice(0, N/2));  // keep positive freqs

    // HPS to emphasize fundamentals
    const spec = hps(mags, 5);

    // Search bins for minF..maxF
    const binHz = sampleRate / N;
    const minBin = Math.max(1, Math.floor(minF / binHz));
    const maxBin = Math.min(spec.length - 1, Math.floor(maxF / binHz));

    let bestBin = -1, bestVal = -Infinity;
    for (let k = minBin; k <= maxBin; k++) {
      const v = spec[k];
      if (v > bestVal) { bestVal = v; bestBin = k; }
    }
    if (bestBin <= 0 || !isFinite(bestVal) || bestVal <= 0) continue;

    const f0 = bestBin * binHz;
    if (!isFinite(f0) || f0 <= 0) continue;

    // Map to pitch class (+ a few harmonics to stabilize)
    for (let h = 1; h <= 4; h++) {
      const fH = f0 * h;
      if (fH > maxF) break;
      const midi = freqToMidi(fH);
      const pc = ((midi % 12) + 12) % 12;
      chroma[pc] += 1;
    }
  }

  // If nothing accumulated, bail
  if (chroma.reduce((a,b)=>a+b,0) === 0) return { key: null, mode: null, conf: 0 };

  const cNorm = normalize(chroma);
  let best = { score: -Infinity, key: null as string | null, mode: null as 'major'|'minor'|null };

  for (let i = 0; i < 12; i++) {
    const maj = normalize(rotate(MAJOR_PROFILE, i));
    const min = normalize(rotate(MINOR_PROFILE, i));

    const sMaj = corr(cNorm, maj);
    if (sMaj > best.score) best = { score: sMaj, key: PITCHES[i], mode: 'major' };

    const sMin = corr(cNorm, min);
    if (sMin > best.score) best = { score: sMin, key: PITCHES[i], mode: 'minor' };
  }

  // crude confidence: project onto best template minus average
  const mean = cNorm.reduce((a,b)=>a+b,0) / 12;
  const conf = Math.max(0, Math.min(1, (best.score - mean) / (1 - mean)));

  return {
    key: best.key ? (best.mode === 'minor' ? `${best.key}m` : best.key) : null,
    mode: best.mode,
    conf: Number(conf.toFixed(2)),
  };
}

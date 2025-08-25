export function rms(samples: Float32Array) {
  let s = 0; for (let i = 0; i < samples.length; i++) { const x = samples[i]; s += x * x; }
  return Math.sqrt(s / samples.length);
}
export function movingAvg(arr: Float32Array, win = 1024) {
  const out = new Float32Array(arr.length); let acc = 0;
  for (let i = 0; i < arr.length; i++) { acc += Math.abs(arr[i]); if (i >= win) acc -= Math.abs(arr[i - win]); out[i] = acc / Math.min(i + 1, win); }
  return out;
}
function downsample(arr: Float32Array, factor: number) {
  const out = new Float32Array(Math.floor(arr.length / factor));
  for (let i = 0, j = 0; i < out.length; i++, j += factor) out[i] = arr[j];
  return out;
}
function autocorr(arr: Float32Array, minLag: number, maxLag: number) {
  let bestLag = -1, bestVal = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0;
    for (let i = lag; i < arr.length; i++) s += arr[i] * arr[i - lag];
    if (s > bestVal) { bestVal = s; bestLag = lag; }
  }
  return { lag: bestLag, val: bestVal };
}
export function estimateTempo(samples: Float32Array, sampleRate: number) {
  if (!samples.length) return { bpm: null, conf: 0 };
  const env = movingAvg(samples, Math.round(sampleRate * 0.02));
  const nov = new Float32Array(env.length);
  for (let i = 1; i < env.length; i++) { const d = env[i] - env[i - 1]; nov[i] = d > 0 ? d : 0; }
  const target = 200;
  const factor = Math.max(1, Math.floor(sampleRate / target));
  const ds = downsample(nov, factor);
  const minLag = Math.round(target * 60 / 200);
  const maxLag = Math.round(target * 60 / 60);
  const { lag, val } = autocorr(ds, minLag, maxLag);
  if (lag <= 0) return { bpm: null, conf: 0 };
  const bpm = Math.round((60 * target) / lag);
  let energy = 0; for (let i = 0; i < ds.length; i++) energy += ds[i] * ds[i];
  const conf = energy ? Math.max(0, Math.min(1, val / energy)) : 0;
  if (bpm < 60 || bpm > 200) return { bpm: null, conf: 0 };
  return { bpm, conf: Number(conf.toFixed(2)) };
}
export function tagRules(duration: number, percussive: number, brightness: number, bpm: number | null) {
  const tags: string[] = [];
  if (bpm != null) {
    if (bpm >= 124 && bpm <= 132) tags.push('house');
    if (bpm >= 68 && bpm <= 76)  tags.push('trap');
    if (bpm >= 88 && bpm <= 96)  tags.push('hiphop');
    if (bpm >= 170 && bpm <= 176) tags.push('dnb');
  }
  if (brightness > 0.55) tags.push('bright'); else tags.push('dark');
  if (percussive > 0.6) tags.push('percussive'); else tags.push('harmonic');

  let typeGuess: string | null = null;
  if (duration <= 65) typeGuess = percussive >= 0.65 ? 'drum-loop' : 'melody-loop';
  else if (duration >= 120) typeGuess = 'demo';

  return { tags: Array.from(new Set(tags)), typeGuess };
}

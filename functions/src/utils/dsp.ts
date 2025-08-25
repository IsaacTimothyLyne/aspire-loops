// DSP-lite utilities used by analyze function

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

/** Base tempo estimate with a novelty curve & autocorrelation. */
export function estimateTempo(samples: Float32Array, sampleRate: number) {
  if (!samples.length) return { bpm: null as number | null, conf: 0, alt: [] as number[] };

  const env = movingAvg(samples, Math.round(sampleRate * 0.02));
  const nov = new Float32Array(env.length);
  for (let i = 1; i < env.length; i++) { const d = env[i] - env[i - 1]; nov[i] = d > 0 ? d : 0; }

  const target = 200;
  const factor = Math.max(1, Math.floor(sampleRate / target));
  const ds = downsample(nov, factor);

  const minLag = Math.round(target * 60 / 200);
  const maxLag = Math.round(target * 60 / 60);
  const { lag, val } = autocorr(ds, minLag, maxLag);

  if (lag <= 0) return { bpm: null, conf: 0, alt: [] };

  const raw = (60 * target) / lag;
  let energy = 0; for (let i = 0; i < ds.length; i++) energy += ds[i] * ds[i];
  const conf = energy ? Math.max(0, Math.min(1, val / energy)) : 0;

  const alt = [];
  if (raw * 0.5 >= 50) alt.push(Math.round(raw * 0.5));
  if (raw * 2   <= 220) alt.push(Math.round(raw * 2));

  const norm = normalizeBpm(raw);
  return { bpm: Math.round(raw), conf: Number(conf.toFixed(2)), alt: Array.from(new Set([norm, ...alt])) };
}

/** Normalize a BPM into the friendly 60..180 window using x2/÷2. */
export function normalizeBpm(bpm: number) {
  let x = bpm;
  while (x > 180) x *= 0.5;
  while (x < 60)  x *= 2;
  return Math.round(x);
}

/** Genre-ish tags purely from BPM (very rough). */
export function genreFromBpm(bpm: number) {
  const out: string[] = [];
  if (bpm >= 124 && bpm <= 132) out.push('house');
  if (bpm >= 128 && bpm <= 138) out.push('techno');
  if (bpm >= 138 && bpm <= 146) out.push('dubstep');
  if (bpm >= 68 && bpm <= 76)   out.push('trap');
  if (bpm >= 88 && bpm <= 96)   out.push('hiphop');
  if (bpm >= 170 && bpm <= 176) out.push('dnb');
  return out;
}

/** Richer tag rules using duration, percussiveness, brightness & (normalized) bpm. */
export function tagRules(
  duration: number,
  percussive: number,
  brightness: number,
  bpmNorm: number | null,
  key?: string | null
) {
  const tags: string[] = [];

  if (bpmNorm != null) {
    // tempo buckets
    if (bpmNorm < 90) tags.push('slow');
    else if (bpmNorm <= 120) tags.push('mid');
    else if (bpmNorm <= 150) tags.push('fast');
    else tags.push('very-fast');

    // fine tag
    tags.push(`tempo-${bpmNorm}bpm`);

    // rough genres
    tags.push(...genreFromBpm(bpmNorm));
  }

  // tone/percussiveness
  tags.push(brightness > 0.55 ? 'bright' : 'dark');
  tags.push(percussive > 0.6 ? 'percussive' : 'harmonic');

  // duration/type hints
  if (duration <= 3 && percussive > 0.6) tags.push('one-shot');
  if (duration <= 65) tags.push('loop');
  else if (duration >= 120) tags.push('demo');

  // key
  if (key) tags.push(`key-${key}`);

  // uniq + cap
  return Array.from(new Set(tags)).slice(0, 12);
}

export function tryDecodeWav(buf: Buffer): { data: Float32Array, sampleRate: number } | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const wav = require('node-wav');
    const dec = wav.decode(buf);
    const ch = dec.channelData?.[0] as Float32Array | undefined;
    if (!ch) return null;
    return { data: ch, sampleRate: dec.sampleRate };
  } catch {
    return null;
  }
}

// src/app/core/parse.ts
export type ParsedMeta = { cleanName: string; bpm?: number; key?: string };

export function parseFilename(fileName: string): ParsedMeta {
  const name = fileName.replace(/\.[a-z0-9]+$/i, '');
  // bpm: “84bpm”, “84 bpm”, “bpm84”
  const bpmMatch = name.match(/(?:^|\D)(\d{2,3})\s*bpm\b/i);
  const bpm = bpmMatch ? Number(bpmMatch[1]) : undefined;

  // key: C, C#, Db, F#m, Gm, “C Maj”, “A minor”, etc.
  const keyMatch = name.match(/\b([A-G](?:#|b)?)\s*(maj|major|m|min|minor)?\b/i);
  let key: string | undefined;
  if (keyMatch) {
    const root = keyMatch[1].toUpperCase().replace('B', '♭').replace('#', '#');
    const qual = keyMatch[2]?.toLowerCase();
    key = qual?.startsWith('m') ? `${root}m` : qual?.startsWith('maj') ? `${root} Maj` : root;
  }
  // clean name: strip bpm/key tokens
  let clean = name
    .replace(/\d{2,3}\s*bpm/ig, '')
    .replace(/\b([A-G](?:#|b)?)(?:\s*(maj|major|m|min|minor))?\b/ig, ' ')
    .replace(/[_\-•]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (!clean) clean = name;
  return { cleanName: clean, bpm, key };
}

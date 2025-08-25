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

export function assistParse(filename: string) {
  const base = filename.replace(/\.[^.]+$/, '');
  const out: any = {};
  const bpmMatch = base.match(/(?:(\d{2,3})\s*bpm)|(\b\d{2,3}\b)/i);
  const keyMatch = base.match(/\b([A-G](?:#|b)?m?(?:aj|maj|min)?)\b/i);
  if (bpmMatch) out.bpm = Number(bpmMatch[1] || bpmMatch[2]);
  if (keyMatch) out.key = keyMatch[1].replace(/aj|maj/i,'M').replace(/min/i,'m');
  let name = base
    .replace(/\b\d{2,3}\s*bpm\b/i,'')
    .replace(/\b\d{2,3}\b/,'')
    .replace(/\b([A-G](?:#|b)?m?(?:aj|maj|min)?)\b/i,'')
    .replace(/[\-_]+/g,' ')
    .replace(/\s{2,}/g,' ')
    .trim();
  out.name = name || base;
  return out;
}

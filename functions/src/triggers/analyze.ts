import { onObjectFinalized } from 'firebase-functions/v2/storage';
import * as logger from 'firebase-functions/logger';
import * as admin from 'firebase-admin';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import { rms, movingAvg, estimateTempo, tagRules } from '../utils/dsp';
import { tryDecodeWav } from '../utils/wav';

const db = admin.firestore();
const storage = admin.storage();
ffmpeg.setFfmpegPath(ffmpegPath as string);

export const analyzeAudio = onObjectFinalized(
  { region: 'us-central1', cpu: 2, memory: '1GiB', timeoutSeconds: 540 },
  async (event) => {
    const obj = event.data;
    const filePath = obj.name || '';
    const contentType = obj.contentType || '';
    const bucketName = obj.bucket;

    logger.info('analyzeAudio:start', { bucketName, filePath, contentType });

    if (/\/preview\.mp3$/i.test(filePath)) return;
    const isAudioByMime = /^audio\//i.test(contentType);
    const isAudioByExt  = /\.(wav|wave|aif|aiff|flac|mp3|m4a|aac|ogg|oga)$/i.test(filePath);
    if (!isAudioByMime && !isAudioByExt) return;

    const parts = filePath.split('/');
    if (parts.length < 5 || parts[0] !== 'users' || parts[2] !== 'files') return;
    const uid = parts[1];
    const fileId = parts[3];

    const bucket = storage.bucket(bucketName);
    const tmpIn  = path.join(os.tmpdir(), 'in-' + path.basename(filePath));
    const tmpWav = path.join(os.tmpdir(), 'analyze-' + fileId + '.wav');

    await bucket.file(filePath).download({ destination: tmpIn });

    await new Promise<void>((resolve, reject) => {
      ffmpeg(tmpIn)
        .audioChannels(1)
        .audioFrequency(22050)
        .duration(60)
        .format('wav')
        .output(tmpWav)
        .on('end', () => resolve())
        .on('error', (e) => reject(e))
        .run();
    });

    const auto: any = { analyzedAt: Date.now() };
    try {
      const buf = fs.readFileSync(tmpWav);
      const dec = tryDecodeWav(buf);
      if (dec) {
        const { data, sampleRate } = dec;
        const dur = data.length / sampleRate;

        const r = rms(data);
        auto.loudness = Number((20 * Math.log10(r + 1e-8)).toFixed(2));

        let diffSum = 0;
        for (let i = 1; i < data.length; i++) diffSum += Math.abs(data[i] - data[i-1]);
        auto.brightness = Number(Math.min(1, diffSum / data.length * 4).toFixed(3));

        const env = movingAvg(data, Math.round(sampleRate * 0.01));
        let pos = 0; for (let i = 1; i < env.length; i++) if (env[i] > env[i-1]) pos++;
        auto.percussive = Number((pos / env.length).toFixed(3));

        const t = estimateTempo(data, sampleRate);
        auto.bpm = t.bpm ?? null;
        auto.bpmConfidence = t.conf;

        auto.key = null; auto.keyConfidence = 0;

        const ruled = tagRules(dur, auto.percussive, auto.brightness, auto.bpm ?? null);
        auto.typeGuess = ruled.typeGuess ?? null;
        auto.tags = ruled.tags;
      }
    } catch (e) {
      logger.warn('analyze: feature error', String(e));
    } finally {
      try { fs.unlinkSync(tmpIn); } catch {}
      try { fs.unlinkSync(tmpWav); } catch {}
    }

    const fileRef = db.doc(`users/${uid}/files/${fileId}`);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(fileRef);
      const cur  = (snap.exists ? snap.data() : {}) || {};
      const patch: any = { auto, updatedAt: Date.now() };

      if (auto.bpm && (cur.bpm == null) && (auto.bpmConfidence ?? 0) >= 0.3) patch.bpm = auto.bpm;
      if (auto.key && (cur.key == null) && (auto.keyConfidence ?? 0) >= 0.3) patch.key = auto.key;
      if (auto.typeGuess && !cur.type) patch.type = auto.typeGuess;
      if (Array.isArray(auto.tags) && auto.tags.length) {
        const curTags = Array.isArray(cur.tags) ? cur.tags : [];
        patch.tags = Array.from(new Set([...curTags, ...auto.tags])).slice(0, 20);
      }

      tx.set(fileRef, patch, { merge: true });
    });

    logger.info('analyzeAudio:done', { filePath });
  }
);

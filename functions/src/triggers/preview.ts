import { onObjectFinalized } from 'firebase-functions/v2/storage';
import * as admin from 'firebase-admin';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';

ffmpeg.setFfmpegPath(ffmpegPath as string);

export const makeAudioPreview = onObjectFinalized(async (event) => {
  const object = event.data;
  const filePath = object.name || '';
  const contentType = object.contentType || '';

  if (!/^audio\//i.test(contentType)) return;
  if (/\/preview\.mp3$/i.test(filePath)) return;

  const parts = filePath.split('/');
  if (parts.length < 5 || parts[0] !== 'users' || parts[2] !== 'files') return;
  const uid = parts[1];
  const fileId = parts[3];

  const bucket = admin.storage().bucket(object.bucket);
  const tmpIn  = path.join(os.tmpdir(), 'in-'  + path.basename(filePath));
  const tmpOut = path.join(os.tmpdir(), 'out-' + fileId + '.mp3');
  const dest   = `users/${uid}/files/${fileId}/preview.mp3`;

  await bucket.file(filePath).download({ destination: tmpIn });

  await new Promise<void>((resolve, reject) => {
    ffmpeg(tmpIn)
      .audioCodec('libmp3lame')
      .audioBitrate('192k')
      .format('mp3')
      .output(tmpOut)
      .on('end', () => resolve())
      .on('error', (e) => reject(e))
      .run();
  });

  await bucket.upload(tmpOut, {
    destination: dest,
    metadata: {
      contentType: 'audio/mpeg',
      cacheControl: 'public, max-age=31536000',
      metadata: { preview: '1', source: filePath },
    },
  });

  try { fs.unlinkSync(tmpIn); } catch {}
  try { fs.unlinkSync(tmpOut); } catch {}

  await admin.firestore().doc(`users/${uid}/files/${fileId}`).update({
    previewPath: dest,
    previewReady: true,
    updatedAt: Date.now(),
  });
});

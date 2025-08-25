import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import * as logger from 'firebase-functions/logger';

export const applyAutoToFile = onDocumentWritten(
  { document: 'users/{uid}/files/{fileId}' },
  async (event) => {
    const after = event.data?.after?.data() as any | undefined;
    if (!after?.auto) return;

    const patch: any = {};
    if ((after.bpm ?? null) == null && (after.auto.bpm ?? null) != null && (after.auto.bpmConfidence ?? 0) >= 0.3) patch.bpm = after.auto.bpm;
    if ((after.key ?? null) == null && (after.auto.key ?? null) != null && (after.auto.keyConfidence ?? 0) >= 0.3) patch.key = after.auto.key;
    if ((after.type ?? null) == null && (after.auto.typeGuess ?? null) != null) patch.type = after.auto.typeGuess;

    const tagsEmpty = !Array.isArray(after.tags) || after.tags.length === 0;
    if (tagsEmpty && Array.isArray(after.auto.tags) && after.auto.tags.length) patch.tags = after.auto.tags;

    if (Object.keys(patch).length) {
      patch.updatedAt = Date.now();
      try { await event.data!.after!.ref.update(patch); logger.info('applyAutoToFile:applied', patch); }
      catch (e) { logger.error('applyAutoToFile:update failed', e as any); }
    }
  }
);

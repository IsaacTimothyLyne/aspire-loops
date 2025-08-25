// functions/src/apply-auto.ts (you can keep it in index.ts if you prefer)
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';

const ts = admin.firestore.FieldValue.serverTimestamp;

function uniq<T>(arr: T[]) { return Array.from(new Set(arr)); }

export const applyAutoToFile = onDocumentUpdated(
  { document: 'users/{uid}/files/{fileId}' },
  async (event) => {
    const before = (event.data?.before?.data() as any) ?? {};
    const after  = (event.data?.after?.data()  as any) ?? {};

    // Only run if we have auto analysis
    if (!after?.auto) return;

    // De-dupe: only apply when a new analysis generation arrives OR the auto blob changed
    const analyzedGenBefore = before.analyzedGen ?? null;
    const analyzedGenAfter  = after.analyzedGen ?? null;
    const appliedGen        = after.autoAppliedGen ?? null;

    const autoChanged = JSON.stringify(before.auto ?? null) !== JSON.stringify(after.auto ?? null);
    const newGen      = analyzedGenAfter && analyzedGenAfter !== appliedGen;

    if (!autoChanged && !newGen) {
      logger.debug('applyAutoToFile: no-op (no new auto/gen)');
      return;
    }

    const patch: any = {};
    const auto = after.auto || {};

    // BPM: only promote if user hasn’t set one, and confidence is decent
    const autoBpm = (auto.bpmNorm ?? auto.bpm) ?? null;
    if ((after.bpm ?? null) == null && autoBpm != null && (auto.bpmConfidence ?? 0) >= 0.3) {
      patch.bpm = autoBpm;
    }

    // Key: only if missing + confident
    if ((after.key ?? null) == null && (auto.key ?? null) && (auto.keyConfidence ?? 0) >= 0.3) {
      patch.key = auto.key;
    }

    // Type: replace "audio" placeholder; otherwise write to typeAuto
    if ((after.type ?? 'audio') === 'audio' && (auto.typeGuess ?? null)) {
      patch.type = auto.typeGuess;
    } else if ((auto.typeGuess ?? null) && (after.typeAuto ?? null) !== auto.typeGuess) {
      patch.typeAuto = auto.typeGuess;
    }

    // Tags: merge (cap at 20)
    const curTags  = Array.isArray(after.tags) ? after.tags : [];
    const autoTags = Array.isArray(auto.tags) ? auto.tags : [];
    if (autoTags.length) {
      const merged = uniq([...curTags, ...autoTags]).slice(0, 20);
      if (merged.length !== curTags.length) patch.tags = merged;
    }

    // Stamp that we applied this analysis generation (prevents loops)
    patch.autoAppliedGen = analyzedGenAfter ?? analyzedGenBefore ?? '1';

    // Only bump updatedAt if we changed a visible field (not just autoAppliedGen)
    const changedKeys = Object.keys(patch).filter(k => k !== 'autoAppliedGen');
    if (changedKeys.length) patch.updatedAt = ts();

    if (Object.keys(patch).length) {
      await event.data!.after!.ref.set(patch, { merge: true });
      logger.info('applyAutoToFile: applied patch', { filePath: event.document, changedKeys });
    } else {
      logger.debug('applyAutoToFile: nothing to write');
    }
  }
);

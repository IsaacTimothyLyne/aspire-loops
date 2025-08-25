import { setGlobalOptions } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';

admin.initializeApp();

setGlobalOptions({
  region: 'us-central1',
  memory: '1GiB',
  cpu: 2,
  timeoutSeconds: 540,
});

export { makeAudioPreview } from './triggers/preview';
export { analyzeAudio }    from './triggers/analyze';
export { applyAutoToFile } from './triggers/applyAuto';

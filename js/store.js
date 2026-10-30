// データ保存の入口。
// firebase-config.js に設定があれば Firestore、なければブラウザ内（ローカル保存）を使います。
// どちらも同じ関数を持っているので、ゲーム側は違いを気にしなくてよい作りです。

import { firebaseConfig } from './firebase-config.js';

let storePromise = null;

export function isFirebaseConfigured() {
  return !!(firebaseConfig && firebaseConfig.apiKey && firebaseConfig.projectId);
}

export function getStore() {
  if (!storePromise) {
    storePromise = isFirebaseConfigured()
      ? import('./store-firebase.js').then((m) => m.createFirebaseStore(firebaseConfig))
      : import('./store-local.js').then((m) => m.createLocalStore());
  }
  return storePromise;
}

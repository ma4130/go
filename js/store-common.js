import { START_BALLS } from './config.js';

// 新しいプレイヤーのデータ
export function newUserData(name, now = Date.now()) {
  return {
    name,
    createdAt: now,
    lastSeenAt: now,
    balls: START_BALLS,
    giftBalls: 0,       // 管理画面から届いた、受け取り待ちのボール
    xp: 0,
    walkedM: 0,
    caughtCount: 0,
    dex: {},            // { キャラID: 捕まえた数 }
    lastLat: null,
    lastLng: null,
    spotCooldowns: {},  // { スポットID: 最後に使った時刻 }
    recentSpawns: {},   // { 出現ID: 時刻 }（捕まえた・逃げられたキャラを再表示しないため）
  };
}

// 名前のチェック。問題があればエラーメッセージ、なければ null
export function validateName(name) {
  if (!name) return '名前を入れてください';
  if ([...name].length > 12) return '名前は12文字までです';
  if (name.includes('/')) return '「/」は使えません';
  if (name === '.' || name === '..' || /^__.*__$/.test(name)) return 'その名前は使えません';
  return null;
}

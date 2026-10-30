// キャラの出現を決める。
// 地図をマス目に区切り、「マス目＋時間帯」から決まった乱数で出すので、
// 同じ場所・同じ時間なら全員に同じキャラが見えます（サーバーに保存しなくてよい）。

import { SPAWN, RARITY } from './config.js';
import { CHARACTERS } from './characters.js';
import { distanceM } from './util.js';

function hash(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(a) {
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const totalWeight = CHARACTERS.reduce((s, c) => s + RARITY[c.rarity].weight, 0);

function pickChar(rng) {
  let r = rng() * totalWeight;
  for (const c of CHARACTERS) {
    r -= RARITY[c.rarity].weight;
    if (r <= 0) return c;
  }
  return CHARACTERS[0];
}

export function currentWindow(now = Date.now()) {
  return Math.floor(now / (SPAWN.windowMin * 60000));
}

// lat,lng の周りに出ているキャラの一覧を返す
export function spawnsAround(lat, lng, now = Date.now()) {
  const w = currentWindow(now);
  const d = SPAWN.cellDeg;
  const cx = Math.floor(lng / d);
  const cy = Math.floor(lat / d);
  const range = Math.ceil(SPAWN.viewRadiusM / (111000 * d * Math.cos((lat * Math.PI) / 180))) + 1;
  const out = [];
  for (let dy = -range; dy <= range; dy++) {
    for (let dx = -range; dx <= range; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      const rng = mulberry32(hash(`${x}:${y}:${w}`));
      const r = rng();
      const n = r < SPAWN.chanceTwo ? 2 : r < SPAWN.chanceOne ? 1 : 0;
      for (let i = 0; i < n; i++) {
        const s = {
          id: `${x}_${y}_${w}_${i}`,
          lat: (y + rng()) * d,
          lng: (x + rng()) * d,
          charId: pickChar(rng).id,
        };
        if (distanceM({ lat, lng }, s) <= SPAWN.viewRadiusM) out.push(s);
      }
    }
  }
  return out;
}

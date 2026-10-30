// ゲーム本体（地図画面）

import { GAME_NAME, SPAWN, SPOT, SPEED_LIMIT_MS, DEFAULT_CENTER, XP } from './config.js';
import { getStore, isFirebaseConfigured } from './store.js';
import { spawnsAround } from './spawn.js';
import { CHARACTERS, getChar } from './characters.js';
import { distanceM, levelFromXp, formatDistance, escapeHtml, randInt, ls } from './util.js';
import { validateName } from './store-common.js';
import { openCapture } from './capture.js';
import { showModal, confirmModal, toast } from './ui.js';

const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
const NAME_KEY = 'arukemon_name';
const WARN_KEY = 'arukemon_warned';

let store;
let user;
let map;
let playerMarker;
let catchCircle;
let pos = null;
let lastFix = null;
let follow = true;
let tooFast = false;
let tooFastUntil = 0;
let capturing = false;
let spots = [];
const spawnMarkers = new Map();
const spotMarkers = new Map();
const dirty = new Set();
let lastSave = 0;

const $ = (id) => document.getElementById(id);

// ---------- はじまり ----------
async function main() {
  $('game-title').textContent = GAME_NAME;
  document.title = GAME_NAME;
  store = await getStore();

  const badges = [];
  if (!isFirebaseConfigured()) badges.push('ローカル保存');
  if (DEBUG) badges.push('デバッグ');
  if (badges.length) {
    $('mode-badge').textContent = badges.join('・');
    $('mode-badge').classList.remove('hidden');
  }

  if (!ls.get(WARN_KEY)) {
    await showWarning();
    ls.set(WARN_KEY, '1');
  }
  user = await login();
  normalizeUser();

  initMap();
  updateHud();
  await loadSpots();
  startLocation();

  setInterval(tick, 5000);
  setInterval(loadSpots, 120000);
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(true); });
  window.addEventListener('pagehide', () => flush(true));

  $('dex-btn').addEventListener('click', showDex);
  $('menu-btn').addEventListener('click', showMenu);
  $('recenter-btn').addEventListener('click', () => {
    follow = true;
    if (pos) map.setView([pos.lat, pos.lng], Math.max(map.getZoom(), 17));
  });
}

function showWarning() {
  return showModal({
    title: 'あそぶまえに',
    html: `<ul class="warn-list">
      <li>🚶 歩きながら画面を見つづけないでね</li>
      <li>🚲 自転車や車の運転中はぜったいに遊ばないでね</li>
      <li>🏠 人の家や立入禁止の場所に入らないでね</li>
      <li>🌙 夜や危ない場所には行かないでね</li>
      <li>👀 まわりをよく見て遊ぼう</li>
    </ul>`,
    buttons: [{ label: 'わかった！', value: true, primary: true }],
  });
}

// 名前だけでログイン。同じ名前を入れると、そのデータで遊べる
async function login() {
  const saved = ls.get(NAME_KEY);
  if (saved) {
    const u = await store.getUser(saved);
    if (u) {
      u.lastSeenAt = Date.now();
      await store.saveUser(saved, { lastSeenAt: u.lastSeenAt });
      return u;
    }
  }
  for (;;) {
    const r = await showModal({
      title: 'なまえをきめよう',
      html: '<p>好きな名前を入れてね（12文字まで）。<br>前に遊んだ名前を入れると、そのデータで続きから遊べるよ。</p>',
      input: { placeholder: 'なまえ', maxlength: 12, validate: validateName },
      buttons: [{ label: 'はじめる', value: true, primary: true }],
    });
    const name = r.input;
    try {
      const existing = await store.getUser(name);
      if (existing) {
        const ok = await confirmModal(`「${name}」はもうあるよ。\nこの名前のデータで遊ぶ？`, 'あそぶ', 'べつの名前にする');
        if (!ok) continue;
        existing.lastSeenAt = Date.now();
        await store.saveUser(name, { lastSeenAt: existing.lastSeenAt });
        ls.set(NAME_KEY, name);
        return existing;
      }
      const u = await store.createUser(name);
      ls.set(NAME_KEY, name);
      toast(`ようこそ、${name}！ ボールを${u.balls}こもらったよ`);
      return u;
    } catch (e) {
      console.error(e);
      await showModal({ title: 'エラー', html: `<p>保存できませんでした。<br>${escapeHtml(e.message)}</p>` });
    }
  }
}

function normalizeUser() {
  user.dex ||= {};
  user.spotCooldowns ||= {};
  user.recentSpawns ||= {};
  // 1時間より古い記録は消す
  const limit = Date.now() - 60 * 60000;
  for (const [k, t] of Object.entries(user.recentSpawns)) if (t < limit) delete user.recentSpawns[k];
}

// ---------- 保存 ----------
function markDirty(...keys) { keys.forEach((k) => dirty.add(k)); }

async function flush(force = false) {
  if (!dirty.size || !user) return;
  if (!force && Date.now() - lastSave < 15000) return;
  const patch = {};
  dirty.forEach((k) => { patch[k] = user[k]; });
  dirty.clear();
  lastSave = Date.now();
  try {
    await store.saveUser(user.name, patch);
  } catch (e) {
    console.error(e);
    Object.keys(patch).forEach((k) => dirty.add(k));
  }
}

// ---------- 地図 ----------
function initMap() {
  const start = user.lastLat != null ? { lat: user.lastLat, lng: user.lastLng } : DEFAULT_CENTER;
  map = L.map('map', { zoomControl: false }).setView([start.lat, start.lng], 18);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);

  playerMarker = L.marker([start.lat, start.lng], {
    icon: L.divIcon({ className: 'player-icon', html: '<div class="player-dot"></div>', iconSize: [28, 28] }),
    zIndexOffset: 1000,
    interactive: false,
  }).addTo(map);
  catchCircle = L.circle([start.lat, start.lng], {
    radius: SPAWN.catchRadiusM, color: '#1fb5a5', weight: 2, dashArray: '6 6', fillOpacity: 0.06, interactive: false,
  }).addTo(map);

  map.on('dragstart', () => { follow = false; });
  if (DEBUG) {
    map.on('click', (e) => handlePosition(e.latlng.lat, e.latlng.lng, 5, null, true));
  }
}

function updateHud() {
  $('ball-count').textContent = user.balls;
  $('level').textContent = levelFromXp(user.xp);
}

// ---------- 位置情報 ----------
function startLocation() {
  if (DEBUG) {
    const s = user.lastLat != null ? { lat: user.lastLat, lng: user.lastLng } : DEFAULT_CENTER;
    handlePosition(s.lat, s.lng, 5, null, true);
    toast('デバッグ: 地図をタップするとそこへ移動。矢印キーでも動けます', 4000);
    window.addEventListener('keydown', (e) => {
      if (!pos) return;
      const step = 0.00009; // 約10m
      const d = { ArrowUp: [step, 0], ArrowDown: [-step, 0], ArrowLeft: [0, -step], ArrowRight: [0, step] }[e.key];
      if (d) handlePosition(pos.lat + d[0], pos.lng + d[1], 5, null, false);
    });
    return;
  }
  if (!navigator.geolocation) {
    showBanner('このブラウザでは位置情報が使えません');
    return;
  }
  showBanner('位置情報を取得中…');
  navigator.geolocation.watchPosition(
    (p) => {
      hideBanner();
      handlePosition(p.coords.latitude, p.coords.longitude, p.coords.accuracy, p.coords.speed, false);
    },
    (err) => {
      if (err.code === 1) showBanner('位置情報が許可されていません。ブラウザの設定で許可してね');
      else showBanner('位置情報が取れません。空が見える場所で試してね');
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
  );
}

function handlePosition(lat, lng, accuracy, speed, teleport) {
  const now = Date.now();
  const here = { lat, lng };
  if (lastFix && !teleport) {
    const d = distanceM(lastFix, here);
    const dt = (now - lastFix.t) / 1000;
    const v = speed != null && speed >= 0 ? speed : dt > 0 ? d / dt : 0;
    // 位置の精度が悪いときは速さを判定しない（GPSの飛びで誤判定しないため）
    if ((accuracy ?? 99) <= 50 && v > SPEED_LIMIT_MS && (d > 20 || speed != null)) tooFastUntil = now + 10000;
    tooFast = now < tooFastUntil;
    if (!tooFast && (accuracy ?? 99) <= 50 && d >= 3 && d <= 200) {
      user.walkedM = (user.walkedM || 0) + d;
      markDirty('walkedM');
    }
  } else if (teleport) {
    tooFast = false;
    tooFastUntil = 0;
  }
  lastFix = { ...here, t: now };
  pos = here;
  user.lastLat = lat;
  user.lastLng = lng;
  markDirty('lastLat', 'lastLng');

  updateFastBanner();

  playerMarker.setLatLng([lat, lng]);
  catchCircle.setLatLng([lat, lng]);
  if (follow) map.setView([lat, lng], map.getZoom(), { animate: !teleport });

  refreshSpawns();
  refreshSpotStyles();
}

// 速すぎる状態は10秒たつと自動で解除
function updateFastBanner() {
  tooFast = Date.now() < tooFastUntil;
  if (tooFast) showBanner('🚗 移動が速すぎます。乗り物に乗っているときは遊べません');
  else if ($('banner').dataset.kind === 'fast') hideBanner();
}

function showBanner(text) {
  const b = $('banner');
  b.textContent = text;
  b.dataset.kind = text.startsWith('🚗') ? 'fast' : 'info';
  b.classList.remove('hidden');
}
function hideBanner() {
  const b = $('banner');
  b.classList.add('hidden');
  b.dataset.kind = '';
}

// ---------- キャラの出現 ----------
function refreshSpawns() {
  if (!pos || capturing) return;
  const list = spawnsAround(pos.lat, pos.lng).filter((s) => !user.recentSpawns[s.id]);
  const ids = new Set(list.map((s) => s.id));
  for (const [id, m] of spawnMarkers) {
    if (!ids.has(id)) { m.remove(); spawnMarkers.delete(id); }
  }
  for (const s of list) {
    let m = spawnMarkers.get(s.id);
    if (!m) {
      const c = getChar(s.charId);
      m = L.marker([s.lat, s.lng], {
        icon: L.divIcon({ className: 'spawn-icon', html: `<div class="spawn r-${c.rarity}">${c.emoji}</div>`, iconSize: [44, 44] }),
      }).addTo(map);
      m.on('click', () => onSpawnClick(s));
      spawnMarkers.set(s.id, m);
    }
    const far = distanceM(pos, s) > SPAWN.catchRadiusM;
    m.getElement()?.classList.toggle('far', far);
  }
}

async function onSpawnClick(s) {
  if (capturing) return;
  if (tooFast) { toast('移動が速すぎるので捕まえられません'); return; }
  const d = distanceM(pos, s);
  if (d > SPAWN.catchRadiusM) {
    toast(`${getChar(s.charId).name}：あと${Math.ceil(d - SPAWN.catchRadiusM)}m 近づいてね`);
    return;
  }
  capturing = true;
  await flush(true);
  const char = getChar(s.charId);
  const res = await openCapture({
    char,
    isNew: !user.dex[char.id],
    getBalls: () => user.balls,
    useBall: () => { user.balls -= 1; markDirty('balls'); updateHud(); },
  });

  if (res.result === 'caught') {
    user.dex[char.id] = (user.dex[char.id] || 0) + 1;
    user.caughtCount = (user.caughtCount || 0) + 1;
    user.xp = (user.xp || 0) + res.xp;
    user.recentSpawns[s.id] = Date.now();
    markDirty('dex', 'caughtCount', 'xp', 'recentSpawns');
    try {
      await store.addCatch(user.name, {
        charId: char.id, caughtAt: Date.now(), lat: s.lat, lng: s.lng,
        judge: res.judge, curve: res.curve, spawnId: s.id,
      });
    } catch (e) { console.error(e); toast('記録の保存に失敗しました'); }
    toast(`${char.name} をつかまえた！ +${res.xp}XP`);
  } else if (res.result === 'fled') {
    user.recentSpawns[s.id] = Date.now();
    markDirty('recentSpawns');
    toast(`${char.name} はにげてしまった…`);
  }
  updateHud();
  await flush(true);
  capturing = false;
  refreshSpawns();
}

// ---------- スポット ----------
async function loadSpots() {
  try {
    spots = await store.listSpots();
  } catch (e) {
    console.error(e);
    return;
  }
  const ids = new Set(spots.map((s) => s.id));
  for (const [id, m] of spotMarkers) {
    if (!ids.has(id)) { m.remove(); spotMarkers.delete(id); }
  }
  for (const s of spots) {
    let m = spotMarkers.get(s.id);
    if (!m) {
      m = L.marker([s.lat, s.lng], {
        icon: L.divIcon({ className: 'spot-icon', html: '<div class="spot"><span></span></div>', iconSize: [36, 36] }),
      }).addTo(map);
      m.on('click', () => onSpotClick(s.id));
      spotMarkers.set(s.id, m);
    } else {
      m.setLatLng([s.lat, s.lng]);
    }
  }
  refreshSpotStyles();
}

function spotRemainMs(id) {
  const last = user.spotCooldowns[id];
  if (!last) return 0;
  return Math.max(0, last + SPOT.cooldownMin * 60000 - Date.now());
}

function refreshSpotStyles() {
  for (const [id, m] of spotMarkers) {
    const el = m.getElement();
    if (!el) continue;
    el.classList.toggle('used', spotRemainMs(id) > 0);
    el.classList.toggle('far', !pos || distanceM(pos, m.getLatLng()) > SPOT.useRadiusM);
  }
}

async function onSpotClick(id) {
  const s = spots.find((x) => x.id === id);
  if (!s || !pos) return;
  const remain = spotRemainMs(id);
  if (remain > 0) {
    const m = Math.floor(remain / 60000);
    const sec = Math.ceil((remain % 60000) / 1000);
    toast(`${s.name}：あと${m ? `${m}分` : ''}${sec}秒で使えるよ`);
    return;
  }
  const d = distanceM(pos, s);
  if (d > SPOT.useRadiusM) {
    toast(`${s.name}：あと${Math.ceil(d - SPOT.useRadiusM)}m 近づいてね`);
    return;
  }
  if (tooFast) { toast('移動が速すぎるので使えません'); return; }
  const gain = randInt(SPOT.ballsMin, SPOT.ballsMax);
  user.balls += gain;
  user.xp = (user.xp || 0) + XP.spot;
  user.spotCooldowns[id] = Date.now();
  markDirty('balls', 'xp', 'spotCooldowns');
  updateHud();
  refreshSpotStyles();
  spotMarkers.get(id)?.getElement()?.classList.add('spin');
  setTimeout(() => spotMarkers.get(id)?.getElement()?.classList.remove('spin'), 800);
  toast(`${s.name}：ボールを${gain}こ手に入れた！ +${XP.spot}XP`);
  await flush(true);
}

// ---------- 図鑑・メニュー ----------
function showDex() {
  const got = CHARACTERS.filter((c) => user.dex[c.id]).length;
  const cells = CHARACTERS.map((c, i) => {
    const n = user.dex[c.id];
    return n
      ? `<div class="dex-cell got r-${c.rarity}"><div class="no">No.${i + 1}</div><div class="emo">${c.emoji}</div><div class="nm">${escapeHtml(c.name)}</div><div class="cnt">×${n}</div></div>`
      : `<div class="dex-cell"><div class="no">No.${i + 1}</div><div class="emo">？</div><div class="nm">？？？</div></div>`;
  }).join('');
  showModal({
    title: `ずかん ${got} / ${CHARACTERS.length}`,
    html: `<div class="dex-grid">${cells}</div>`,
    buttons: [{ label: 'とじる', value: true, primary: true }],
  });
}

async function showMenu() {
  const r = await showModal({
    title: user.name,
    html: `<table class="info-table">
      <tr><th>レベル</th><td>${levelFromXp(user.xp)}（${user.xp || 0} XP）</td></tr>
      <tr><th>ボール</th><td>${user.balls}こ</td></tr>
      <tr><th>捕まえた数</th><td>${user.caughtCount || 0}匹</td></tr>
      <tr><th>歩いた距離</th><td>${formatDistance(user.walkedM)}</td></tr>
    </table>`,
    buttons: [
      { label: 'ログアウト', value: 'logout' },
      { label: '注意を見る', value: 'warn' },
      { label: 'とじる', value: 'close', primary: true },
    ],
  });
  if (r === 'warn') showWarning();
  if (r === 'logout') {
    const ok = await confirmModal('ログアウトする？\n同じ名前を入れればまた続きから遊べるよ');
    if (ok) {
      await flush(true);
      ls.remove(NAME_KEY);
      location.reload();
    }
  }
}

function tick() {
  updateFastBanner();
  refreshSpawns();
  refreshSpotStyles();
  flush();
}

main().catch((e) => {
  console.error(e);
  showModal({ title: 'エラー', html: `<p>ゲームを始められませんでした。<br>${escapeHtml(e.message)}</p>` });
});

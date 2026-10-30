// 管理画面：ユーザー一覧と詳細

import { getStore, isFirebaseConfigured } from './store.js';
import { CHARACTERS, getChar } from './characters.js';
import { levelFromXp, formatDistance, formatDate, escapeHtml, JUDGE_LABEL } from './util.js';
import { validateName } from './store-common.js';
import { showModal, confirmModal, toast } from './ui.js';
import { DEFAULT_CENTER } from './config.js';

let store;
let users = [];
let sortKey = 'lastSeenAt';
let sortDir = -1;
let detailMap = null;

const $ = (id) => document.getElementById(id);

const COLUMNS = [
  { key: 'name', label: '名前' },
  { key: 'createdAt', label: '始めた日' },
  { key: 'lastSeenAt', label: '最後に遊んだ日' },
  { key: 'caughtCount', label: '捕まえた数' },
  { key: 'dexCount', label: '図鑑' },
  { key: 'xp', label: 'レベル' },
];

async function main() {
  store = await getStore();
  if (!isFirebaseConfigured()) $('mode-badge').classList.remove('hidden');
  $('search').addEventListener('input', renderList);
  $('refresh-btn').addEventListener('click', () => loadUsers());
  $('back-btn').addEventListener('click', () => { location.hash = ''; });
  window.addEventListener('hashchange', route);
  await loadUsers();
}

async function loadUsers() {
  try {
    users = (await store.listUsers()).map((u) => ({ ...u, dexCount: Object.keys(u.dex || {}).length }));
  } catch (e) {
    console.error(e);
    toast(`読み込みに失敗しました: ${e.message}`);
    users = [];
  }
  route();
}

function route() {
  const m = location.hash.match(/^#user=(.+)$/);
  if (m) showDetail(decodeURIComponent(m[1]));
  else showList();
}

// ---------- 一覧 ----------
function showList() {
  $('list-view').classList.remove('hidden');
  $('detail-view').classList.add('hidden');
  renderList();
}

function renderList() {
  const q = $('search').value.trim().toLowerCase();
  const rows = users
    .filter((u) => !q || u.name.toLowerCase().includes(q))
    .sort((a, b) => {
      const x = a[sortKey] ?? 0;
      const y = b[sortKey] ?? 0;
      return (typeof x === 'string' ? x.localeCompare(y, 'ja') : x - y) * sortDir;
    });

  $('user-count').textContent = `${users.length}人`;
  const head = COLUMNS.map((c) => {
    const mark = c.key === sortKey ? (sortDir > 0 ? ' ▲' : ' ▼') : '';
    return `<th data-key="${c.key}">${c.label}${mark}</th>`;
  }).join('');
  const body = rows.map((u) => `
    <tr data-name="${escapeHtml(u.name)}">
      <td class="name">${escapeHtml(u.name)}</td>
      <td>${formatDate(u.createdAt).slice(0, 10)}</td>
      <td>${formatDate(u.lastSeenAt)}</td>
      <td>${u.caughtCount || 0}</td>
      <td>${u.dexCount} / ${CHARACTERS.length}</td>
      <td>${levelFromXp(u.xp)}</td>
    </tr>`).join('');
  $('user-table').innerHTML = `<thead><tr>${head}</tr></thead><tbody>${body || `<tr><td colspan="${COLUMNS.length}" class="empty">ユーザーがいません</td></tr>`}</tbody>`;

  $('user-table').querySelectorAll('th').forEach((th) => th.addEventListener('click', () => {
    const k = th.dataset.key;
    if (sortKey === k) sortDir *= -1;
    else { sortKey = k; sortDir = k === 'name' ? 1 : -1; }
    renderList();
  }));
  $('user-table').querySelectorAll('tbody tr[data-name]').forEach((tr) => tr.addEventListener('click', () => {
    location.hash = `user=${encodeURIComponent(tr.dataset.name)}`;
  }));
}

// ---------- 詳細 ----------
async function showDetail(name) {
  $('list-view').classList.add('hidden');
  $('detail-view').classList.remove('hidden');
  $('detail').innerHTML = '<p>読み込み中…</p>';

  let u;
  let catches;
  try {
    u = await store.getUser(name);
    catches = u ? await store.listCatches(name) : [];
  } catch (e) {
    $('detail').innerHTML = `<p>読み込みに失敗しました: ${escapeHtml(e.message)}</p>`;
    return;
  }
  if (!u) {
    $('detail').innerHTML = '<p>このユーザーは見つかりません。</p>';
    return;
  }
  const dex = u.dex || {};
  const dexCount = Object.keys(dex).length;

  const dexCells = CHARACTERS.map((c) => (dex[c.id]
    ? `<div class="dex-mini got r-${c.rarity}" title="${escapeHtml(c.name)}">${c.emoji}<small>×${dex[c.id]}</small></div>`
    : '<div class="dex-mini">？</div>')).join('');

  const catchRows = catches.map((c) => {
    const ch = getChar(c.charId);
    const how = [c.judge ? JUDGE_LABEL[c.judge] : '', c.curve ? 'カーブ' : ''].filter(Boolean).join('・') || '-';
    return `<tr><td>${ch.emoji} ${escapeHtml(ch.name)}</td><td>${formatDate(c.caughtAt)}</td><td>${how}</td>
      <td>${c.lat != null ? `<button class="link" data-lat="${c.lat}" data-lng="${c.lng}">地図</button>` : '-'}</td></tr>`;
  }).join('');

  $('detail').innerHTML = `
    <h2>${escapeHtml(u.name)}</h2>
    <section class="card">
      <h3>基本情報</h3>
      <table class="info-table">
        <tr><th>始めた日</th><td>${formatDate(u.createdAt)}</td></tr>
        <tr><th>最後に遊んだ日時</th><td>${formatDate(u.lastSeenAt)}</td></tr>
        <tr><th>最後にいた場所</th><td>${u.lastLat != null ? `${u.lastLat.toFixed(5)}, ${u.lastLng.toFixed(5)}` : '-'}</td></tr>
      </table>
    </section>
    <section class="card">
      <h3>成績</h3>
      <table class="info-table">
        <tr><th>レベル</th><td>${levelFromXp(u.xp)}（${u.xp || 0} XP）</td></tr>
        <tr><th>捕まえた合計</th><td>${u.caughtCount || 0}匹</td></tr>
        <tr><th>図鑑</th><td>${dexCount} / ${CHARACTERS.length}</td></tr>
        <tr><th>歩いた距離</th><td>${formatDistance(u.walkedM)}</td></tr>
      </table>
    </section>
    <section class="card">
      <h3>持っているアイテム</h3>
      <table class="info-table"><tr><th>ボール</th><td>${u.balls ?? 0}こ</td></tr></table>
    </section>
    <section class="card">
      <h3>地図（🔵最後にいた場所・キャラ＝捕まえた場所）</h3>
      <div id="detail-map"></div>
    </section>
    <section class="card">
      <h3>図鑑</h3>
      <div class="dex-mini-grid">${dexCells}</div>
    </section>
    <section class="card">
      <h3>捕まえたキャラ（${catches.length}件）</h3>
      <div class="table-wrap"><table class="list-table">
        <thead><tr><th>キャラ</th><th>日時</th><th>投げ方</th><th>場所</th></tr></thead>
        <tbody>${catchRows || '<tr><td colspan="4" class="empty">まだいません</td></tr>'}</tbody>
      </table></div>
    </section>
    <section class="card danger">
      <h3>管理用の操作</h3>
      <div class="actions">
        <button id="act-rename">名前を変える</button>
        <button id="act-reset">データをリセット</button>
        <button id="act-delete" class="danger">ユーザーを削除</button>
      </div>
    </section>`;

  // 地図
  if (detailMap) { detailMap.remove(); detailMap = null; }
  const points = [];
  detailMap = L.map('detail-map');
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(detailMap);
  if (u.lastLat != null) {
    L.marker([u.lastLat, u.lastLng], {
      icon: L.divIcon({ className: 'player-icon', html: '<div class="player-dot"></div>', iconSize: [24, 24] }),
      zIndexOffset: 1000,
    }).bindPopup(`最後にいた場所<br>${formatDate(u.lastSeenAt)}`).addTo(detailMap);
    points.push([u.lastLat, u.lastLng]);
  }
  for (const c of catches) {
    if (c.lat == null) continue;
    const ch = getChar(c.charId);
    L.marker([c.lat, c.lng], {
      icon: L.divIcon({ className: 'spawn-icon', html: `<div class="spawn small r-${ch.rarity}">${ch.emoji}</div>`, iconSize: [30, 30] }),
    }).bindPopup(`${escapeHtml(ch.name)}<br>${formatDate(c.caughtAt)}`).addTo(detailMap);
    points.push([c.lat, c.lng]);
  }
  if (points.length) detailMap.fitBounds(points, { padding: [30, 30], maxZoom: 17 });
  else detailMap.setView([DEFAULT_CENTER.lat, DEFAULT_CENTER.lng], 12);

  $('detail').querySelectorAll('button[data-lat]').forEach((b) => b.addEventListener('click', () => {
    detailMap.setView([Number(b.dataset.lat), Number(b.dataset.lng)], 18);
    $('detail-map').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }));

  // 操作
  $('act-rename').addEventListener('click', async () => {
    const r = await showModal({
      title: '名前を変える',
      html: `<p>「${escapeHtml(u.name)}」の新しい名前</p>`,
      input: { value: u.name, maxlength: 12, validate: validateName },
      buttons: [{ label: 'やめる', value: false }, { label: '変える', value: true, primary: true }],
    });
    if (!r.value || r.input === u.name) return;
    try {
      await store.renameUser(u.name, r.input);
      toast('名前を変えました');
      await loadUsers();
      location.hash = `user=${encodeURIComponent(r.input)}`;
    } catch (e) { toast(e.message); }
  });
  $('act-reset').addEventListener('click', async () => {
    if (!(await confirmModal(`「${u.name}」のデータを最初の状態に戻しますか？\n（捕まえたキャラも消えます）`, 'リセット', 'やめる'))) return;
    try { await store.resetUser(u.name); toast('リセットしました'); await loadUsers(); } catch (e) { toast(e.message); }
  });
  $('act-delete').addEventListener('click', async () => {
    if (!(await confirmModal(`「${u.name}」を削除しますか？\n元に戻せません`, '削除', 'やめる'))) return;
    try { await store.deleteUser(u.name); toast('削除しました'); location.hash = ''; await loadUsers(); } catch (e) { toast(e.message); }
  });
}

main().catch((e) => {
  console.error(e);
  toast(`エラー: ${e.message}`, 5000);
});

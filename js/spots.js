// スポット管理画面：地図をタップしてスポットを追加・名前変更・削除

import { getStore, isFirebaseConfigured } from './store.js';
import { DEFAULT_CENTER } from './config.js';
import { escapeHtml } from './util.js';
import { showModal, confirmModal, toast } from './ui.js';

let store;
let map;
let spots = [];
const markers = new Map();

const $ = (id) => document.getElementById(id);

async function main() {
  store = await getStore();
  if (!isFirebaseConfigured()) $('mode-badge').classList.remove('hidden');

  map = L.map('map').setView([DEFAULT_CENTER.lat, DEFAULT_CENTER.lng], 16);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
  map.on('click', (e) => addSpotAt(e.latlng));

  $('here-btn').addEventListener('click', goHere);
  $('list-toggle').addEventListener('click', () => $('spot-panel').classList.toggle('open'));

  await loadSpots(true);
  goHere(true);
}

function goHere(silent) {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    (p) => map.setView([p.coords.latitude, p.coords.longitude], 17),
    () => { if (silent !== true) toast('現在地が取れませんでした'); },
    { enableHighAccuracy: true, timeout: 10000 },
  );
}

async function loadSpots(fit = false) {
  try {
    spots = await store.listSpots();
  } catch (e) {
    toast(`読み込みに失敗しました: ${e.message}`);
    return;
  }
  spots.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ja'));
  for (const m of markers.values()) m.remove();
  markers.clear();
  for (const s of spots) {
    const m = L.marker([s.lat, s.lng], {
      icon: L.divIcon({ className: 'spot-icon', html: '<div class="spot"><span></span></div>', iconSize: [36, 36] }),
      draggable: true,
    }).addTo(map);
    m.bindPopup(() => popupHtml(s));
    m.on('popupopen', (e) => bindPopup(e.popup, s));
    m.on('dragend', async () => {
      const { lat, lng } = m.getLatLng();
      try { await store.updateSpot(s.id, { lat, lng }); toast(`「${s.name}」を移動しました`); s.lat = lat; s.lng = lng; } catch (err) { toast(err.message); }
    });
    markers.set(s.id, m);
  }
  renderList();
  if (fit && spots.length) map.fitBounds(spots.map((s) => [s.lat, s.lng]), { padding: [40, 40], maxZoom: 17 });
}

function popupHtml(s) {
  return `<div class="spot-popup"><b>${escapeHtml(s.name)}</b><br>
    <small>${s.lat.toFixed(5)}, ${s.lng.toFixed(5)}</small>
    <div class="actions"><button data-act="rename">名前を変える</button><button data-act="delete" class="danger">削除</button></div>
    <small>ドラッグで移動できます</small></div>`;
}

function bindPopup(popup, s) {
  const el = popup.getElement();
  el.querySelector('[data-act="rename"]').addEventListener('click', async () => {
    map.closePopup();
    const r = await showModal({
      title: 'スポットの名前',
      input: { value: s.name, maxlength: 30, validate: (v) => (v ? null : '名前を入れてください') },
      buttons: [{ label: 'やめる', value: false }, { label: '保存', value: true, primary: true }],
    });
    if (!r.value) return;
    try { await store.updateSpot(s.id, { name: r.input }); toast('保存しました'); await loadSpots(); } catch (e) { toast(e.message); }
  });
  el.querySelector('[data-act="delete"]').addEventListener('click', async () => {
    map.closePopup();
    if (!(await confirmModal(`「${s.name}」を削除しますか？`, '削除', 'やめる'))) return;
    try { await store.deleteSpot(s.id); toast('削除しました'); await loadSpots(); } catch (e) { toast(e.message); }
  });
}

async function addSpotAt(latlng) {
  const r = await showModal({
    title: 'ここにスポットを置く',
    html: `<p><small>${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}</small></p>`,
    input: { placeholder: '例：〇〇公園', maxlength: 30, validate: (v) => (v ? null : '名前を入れてください') },
    buttons: [{ label: 'やめる', value: false }, { label: '置く', value: true, primary: true }],
  });
  if (!r.value) return;
  try {
    await store.addSpot({ name: r.input, lat: latlng.lat, lng: latlng.lng });
    toast(`「${r.input}」を置きました`);
    await loadSpots();
  } catch (e) { toast(e.message); }
}

function renderList() {
  $('spot-count').textContent = `${spots.length}こ`;
  $('spot-list').innerHTML = spots.length
    ? spots.map((s) => `<li data-id="${s.id}">📍 ${escapeHtml(s.name)}</li>`).join('')
    : '<li class="empty">まだスポットがありません。地図をタップして置いてね</li>';
  $('spot-list').querySelectorAll('li[data-id]').forEach((li) => li.addEventListener('click', () => {
    const m = markers.get(li.dataset.id);
    if (!m) return;
    map.setView(m.getLatLng(), 18);
    m.openPopup();
    $('spot-panel').classList.remove('open');
  }));
}

main().catch((e) => {
  console.error(e);
  toast(`エラー: ${e.message}`, 5000);
});

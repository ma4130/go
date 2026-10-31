// スポット管理画面：ゲームと同じ見た目の地図で、スポットを追加・名前変更・移動・削除

import { getStore, isFirebaseConfigured } from './store.js';
import { DEFAULT_CENTER } from './config.js';
import { escapeHtml } from './util.js';
import { createEditMap, createSpotElement } from './map3d.js';
import { showModal, confirmModal, toast } from './ui.js';

let store;
let map;
let spots = [];
const markers = new Map();
let hereMarker = null;

const $ = (id) => document.getElementById(id);

async function main() {
  store = await getStore();
  if (!isFirebaseConfigured()) $('mode-badge').classList.remove('hidden');

  // ゲーム画面のボタンから来たときは、その場所を中心に開く
  const params = new URLSearchParams(location.search);
  const lat = Number(params.get('lat'));
  const lng = Number(params.get('lng'));
  const fromGame = params.has('lat') && Number.isFinite(lat) && Number.isFinite(lng);
  const center = fromGame ? { lat, lng } : DEFAULT_CENTER;

  map = await createEditMap({ container: 'map', center, zoom: fromGame ? 18 : 16 });
  map.on('click', (e) => addSpotAt(e.lngLat));

  $('here-btn').addEventListener('click', () => goHere(false));
  $('list-toggle').addEventListener('click', () => $('spot-panel').classList.toggle('open'));

  if (fromGame) {
    showHere(center);
    await loadSpots(false);
  } else {
    await loadSpots(true);
    goHere(true);
  }
}

// 今いる場所（青い点）
function showHere({ lat, lng }) {
  if (!hereMarker) {
    const el = document.createElement('div');
    el.className = 'here-dot';
    el.title = '今いる場所';
    hereMarker = new maplibregl.Marker({ element: el }).setLngLat([lng, lat]).addTo(map);
  } else {
    hereMarker.setLngLat([lng, lat]);
  }
}

function goHere(silent) {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    (p) => {
      const here = { lat: p.coords.latitude, lng: p.coords.longitude };
      showHere(here);
      map.easeTo({ center: [here.lng, here.lat], zoom: 18, duration: silent === true ? 0 : 800 });
    },
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
    const el = createSpotElement();
    el.title = s.name;
    const label = document.createElement('div');
    label.className = 'spot-label';
    label.textContent = s.name;
    el.appendChild(label);

    const m = new maplibregl.Marker({ element: el, anchor: 'bottom', draggable: true })
      .setLngLat([s.lng, s.lat])
      .addTo(map);
    // タップでメニュー（ドラッグしたときは開かない）
    let dragged = false;
    m.on('dragstart', () => { dragged = true; });
    m.on('dragend', async () => {
      const ll = m.getLngLat();
      try {
        await store.updateSpot(s.id, { lat: ll.lat, lng: ll.lng });
        s.lat = ll.lat;
        s.lng = ll.lng;
        toast(`「${s.name}」を移動しました`);
      } catch (err) { toast(err.message); }
      setTimeout(() => { dragged = false; }, 50);
    });
    el.addEventListener('click', (e) => {
      e.stopPropagation(); // 地図のクリック（新しく置く）を起こさない
      if (!dragged) openSpotMenu(s);
    });
    markers.set(s.id, m);
  }
  renderList();
  if (fit && spots.length) {
    const b = new maplibregl.LngLatBounds();
    spots.forEach((s) => b.extend([s.lng, s.lat]));
    map.fitBounds(b, { padding: 60, maxZoom: 17.5, duration: 0 });
  }
}

async function openSpotMenu(s) {
  const r = await showModal({
    title: s.name,
    html: `<p class="sub">${s.lat.toFixed(5)}, ${s.lng.toFixed(5)}<br>スポットを長押ししてドラッグすると移動できます</p>`,
    buttons: [
      { label: '削除', value: 'delete' },
      { label: '名前を変える', value: 'rename' },
      { label: 'とじる', value: 'close', primary: true },
    ],
  });
  if (r === 'rename') {
    const n = await showModal({
      title: 'スポットの名前',
      input: { value: s.name, maxlength: 30, validate: (v) => (v ? null : '名前を入れてください') },
      buttons: [{ label: 'やめる', value: false }, { label: '保存', value: true, primary: true }],
    });
    if (!n.value) return;
    try { await store.updateSpot(s.id, { name: n.input }); toast('保存しました'); await loadSpots(); } catch (e) { toast(e.message); }
  }
  if (r === 'delete') {
    if (!(await confirmModal(`「${s.name}」を削除しますか？`, '削除', 'やめる'))) return;
    try { await store.deleteSpot(s.id); toast('削除しました'); await loadSpots(); } catch (e) { toast(e.message); }
  }
}

async function addSpotAt(lngLat) {
  const r = await showModal({
    title: 'ここにスポットを置く',
    html: `<p class="sub">${lngLat.lat.toFixed(5)}, ${lngLat.lng.toFixed(5)}</p>`,
    input: { placeholder: '例：〇〇公園', maxlength: 30, validate: (v) => (v ? null : '名前を入れてください') },
    buttons: [{ label: 'やめる', value: false }, { label: '置く', value: true, primary: true }],
  });
  if (!r.value) return;
  try {
    await store.addSpot({ name: r.input, lat: lngLat.lat, lng: lngLat.lng });
    toast(`「${r.input}」を置きました`);
    await loadSpots();
  } catch (e) { toast(e.message); }
}

function renderList() {
  $('spot-count').textContent = `${spots.length}こ`;
  $('spot-list').innerHTML = spots.length
    ? spots.map((s) => `<li data-id="${s.id}"><span class="mini-gem"></span>${escapeHtml(s.name)}</li>`).join('')
    : '<li class="empty">まだスポットがありません。地図をタップして置いてね</li>';
  $('spot-list').querySelectorAll('li[data-id]').forEach((li) => li.addEventListener('click', () => {
    const s = spots.find((x) => x.id === li.dataset.id);
    if (!s) return;
    $('spot-panel').classList.remove('open');
    map.easeTo({ center: [s.lng, s.lat], zoom: 18.5, duration: 800 });
  }));
}

main().catch((e) => {
  console.error(e);
  toast(`エラー: ${e.message}`, 5000);
});

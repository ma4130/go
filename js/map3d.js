// 斜めの3D地図（MapLibre GL JS ＋ OpenFreeMap、3Dの自分キャラは three.js）
//   ・地図は傾けて表示し、建物は立体
//   ・自分のキャラはいつも画面の下寄り中央。歩くと地図がついてくる
//   ・1本指で左右にスワイプすると回転、2本指でズーム
//   ・時間帯で昼と夜の色が変わる
//   ・lite=true のときは「軽い表示」（傾けない・建物なし・3Dキャラなし）

const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const THREE_URL = 'https://unpkg.com/three@0.160.0/build/three.module.js';
const PITCH = 60;
const ZOOM = 17.6;

// ゲームらしい色（オリジナル配色）
const PALETTE = {
  day: {
    bg: '#9fe0a0', land: '#a6e3a1', park: '#6fcf7f', water: '#59c3f0', road: '#fdf7d8',
    roadCase: '#7cc38b', path: '#e8f5c8', building: '#dcd6f2', sky: '#8fd3ff', horizon: '#e3f6ff',
    range: '#ffffff',
  },
  night: {
    bg: '#24465c', land: '#284d63', park: '#1f5a57', water: '#173a78', road: '#6f86b8',
    roadCase: '#2f5470', path: '#4d6a8c', building: '#3e4f7d', sky: '#0b1730', horizon: '#26406b',
    range: '#bfe6ff',
  },
};

export function isNight(d = new Date()) {
  const h = d.getHours();
  return h < 6 || h >= 18;
}

function circleFeature(lat, lng, r, n = 64) {
  const coords = [];
  const dLat = r / 111320;
  const dLng = r / (111320 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    coords.push([lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)]);
  }
  return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [coords] }, properties: {} };
}

// 地図の見た目をゲーム用に塗り直す
function applyGameStyle(map, pal, lite) {
  const layers = map.getStyle()?.layers || [];
  for (const layer of layers) {
    const id = layer.id.toLowerCase();
    if (id.startsWith('game-')) continue;
    const setP = (k, v) => { try { map.setPaintProperty(layer.id, k, v); } catch { /* 無視 */ } };
    const hide = () => { try { map.setLayoutProperty(layer.id, 'visibility', 'none'); } catch { /* 無視 */ } };
    switch (layer.type) {
      case 'background':
        setP('background-color', pal.bg);
        break;
      case 'fill':
        if (/water|ocean|river|lake|sea/.test(id)) setP('fill-color', pal.water);
        else if (/building/.test(id)) hide();
        else if (/park|grass|wood|forest|green|garden|pitch|cemetery|scrub|wetland|landcover|golf/.test(id)) setP('fill-color', pal.park);
        else setP('fill-color', pal.land);
        setP('fill-outline-color', 'rgba(0,0,0,0)');
        break;
      case 'line':
        if (/water|river|stream|canal|ditch|drain/.test(id)) setP('line-color', pal.water);
        else if (/boundary|admin|ferry|aerialway/.test(id)) hide();
        else if (/rail|transit/.test(id)) setP('line-color', pal.roadCase);
        else if (/casing|outline/.test(id)) setP('line-color', pal.roadCase);
        else if (/path|foot|cycle|track|steps|pedestrian/.test(id)) setP('line-color', pal.path);
        else setP('line-color', pal.road);
        break;
      case 'symbol':
        hide(); // 文字やお店のアイコンは消してゲームらしく
        break;
      case 'fill-extrusion':
        setP('fill-extrusion-color', pal.building);
        setP('fill-extrusion-opacity', 0.88);
        if (lite) hide();
        break;
      case 'hillshade':
      case 'raster':
        hide();
        break;
      default:
        break;
    }
  }

  // 建物の立体レイヤーがなければ足す
  const hasExtrusion = layers.some((l) => l.type === 'fill-extrusion');
  if (!hasExtrusion && !lite && map.getSource('openmaptiles') && !map.getLayer('game-buildings')) {
    try {
      map.addLayer({
        id: 'game-buildings',
        type: 'fill-extrusion',
        source: 'openmaptiles',
        'source-layer': 'building',
        minzoom: 15,
        paint: {
          'fill-extrusion-color': pal.building,
          'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 8],
          'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
          'fill-extrusion-opacity': 0.88,
        },
      });
    } catch { /* 無視 */ }
  }
  if (map.getLayer('game-buildings')) map.setPaintProperty('game-buildings', 'fill-extrusion-color', pal.building);

  try {
    map.setSky({ 'sky-color': pal.sky, 'horizon-color': pal.horizon, 'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.6, 'fog-color': pal.horizon, 'fog-ground-blend': 0.2 });
  } catch { /* 古い版では空の設定なし */ }

  if (map.getLayer('game-range-fill')) {
    map.setPaintProperty('game-range-fill', 'fill-color', pal.range);
    map.setPaintProperty('game-range-line', 'line-color', pal.range);
  }
}

// ---------- 3Dの自分キャラ（オリジナルデザイン） ----------
function buildAvatar(THREE) {
  const g = new THREE.Group();
  const mat = (color) => new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide });
  const skin = mat(0xffd9b3);
  const jacket = mat(0x1fb5a5);
  const pants = mat(0x2b3a67);
  const capM = mat(0xf2b705);
  const black = mat(0x222222);

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.45, 24),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.01;
  g.add(shadow);

  const legGeo = new THREE.CylinderGeometry(0.09, 0.08, 0.6, 10);
  legGeo.translate(0, -0.3, 0); // 付け根で回るように
  const legL = new THREE.Mesh(legGeo, pants);
  const legR = new THREE.Mesh(legGeo, pants);
  legL.position.set(-0.12, 0.62, 0);
  legR.position.set(0.12, 0.62, 0);
  g.add(legL, legR);

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.62, 16), jacket);
  body.position.y = 0.92;
  g.add(body);

  const armGeo = new THREE.CylinderGeometry(0.07, 0.065, 0.55, 10);
  armGeo.translate(0, -0.27, 0);
  const armL = new THREE.Mesh(armGeo, jacket);
  const armR = new THREE.Mesh(armGeo, jacket);
  armL.position.set(-0.33, 1.18, 0);
  armR.position.set(0.33, 1.18, 0);
  g.add(armL, armR);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 20, 16), skin);
  head.position.y = 1.5;
  g.add(head);

  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.285, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), capM);
  cap.position.y = 1.55;
  g.add(cap);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 16, 1, false, -Math.PI / 2, Math.PI), capM);
  brim.position.set(0, 1.56, 0.2);
  g.add(brim);

  const eyeGeo = new THREE.SphereGeometry(0.035, 8, 8);
  const eyeL = new THREE.Mesh(eyeGeo, black);
  const eyeR = new THREE.Mesh(eyeGeo, black);
  eyeL.position.set(-0.09, 1.5, 0.25);
  eyeR.position.set(0.09, 1.5, 0.25);
  g.add(eyeL, eyeR);

  g.userData = { legL, legR, armL, armR, body, head, cap, brim, eyeL, eyeR };
  return g;
}

function animateAvatar(g, t, moving) {
  const { legL, legR, armL, armR } = g.userData;
  const swing = moving ? Math.sin(t * 9) * 0.6 : 0;
  legL.rotation.x = swing;
  legR.rotation.x = -swing;
  armL.rotation.x = -swing * 0.8;
  armR.rotation.x = swing * 0.8;
  const bob = moving ? Math.abs(Math.sin(t * 9)) * 0.05 : Math.sin(t * 2) * 0.015;
  for (const k of ['body', 'head', 'cap', 'brim', 'eyeL', 'eyeR']) {
    const m = g.userData[k];
    if (m.userData.baseY == null) m.userData.baseY = m.position.y;
    m.position.y = m.userData.baseY + bob;
  }
  for (const m of [armL, armR]) {
    if (m.userData.baseY == null) m.userData.baseY = m.position.y;
    m.position.y = m.userData.baseY + bob;
  }
}

function createAvatarLayer(THREE, getState) {
  return {
    id: 'game-avatar',
    type: 'custom',
    renderingMode: '3d',
    onAdd(map, gl) {
      this.map = map;
      this.camera = new THREE.Camera();
      this.scene = new THREE.Scene();
      this.scene.add(new THREE.AmbientLight(0xffffff, 1.6));
      const sun = new THREE.DirectionalLight(0xffffff, 1.8);
      sun.position.set(1, 2.5, 1.5);
      this.scene.add(sun);
      this.avatar = buildAvatar(THREE);
      this.scene.add(this.avatar);
      this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
      this.renderer.autoClear = false;
      this.rotX = new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(1, 0, 0), Math.PI / 2);
      this.t0 = performance.now();
    },
    render(gl, matrix) {
      const st = getState();
      if (!st.pos) return;
      const mc = maplibregl.MercatorCoordinate.fromLngLat([st.pos.lng, st.pos.lat], 0);
      // 画面上でだいたい同じ大きさ（約110px）に見えるように、ズームに合わせて大きさを変える
      const mpp = (40075016.686 * Math.cos((st.pos.lat * Math.PI) / 180)) / (512 * 2 ** this.map.getZoom());
      const meters = (110 * mpp) / 1.85;
      const s = mc.meterInMercatorCoordinateUnits() * meters;
      const l = new THREE.Matrix4()
        .makeTranslation(mc.x, mc.y, mc.z)
        .scale(new THREE.Vector3(s, -s, s))
        .multiply(this.rotX);
      this.camera.projectionMatrix = new THREE.Matrix4().fromArray(matrix).multiply(l);
      this.avatar.rotation.y = (st.heading * Math.PI) / 180; // 0=北向き、90=東向き
      animateAvatar(this.avatar, (performance.now() - this.t0) / 1000, st.moving);
      this.renderer.resetState();
      this.renderer.render(this.scene, this.camera);
      this.map.triggerRepaint();
    },
  };
}

// ---------- 地図をつくる ----------
export async function createGameMap({ container, center, lite = false, onMapClick = null }) {
  const night = isNight();
  let pal = night ? PALETTE.night : PALETTE.day;

  const map = new maplibregl.Map({
    container,
    style: STYLE_URL,
    center: [center.lng, center.lat],
    zoom: ZOOM,
    pitch: lite ? 0 : PITCH,
    bearing: 0,
    minZoom: 15.5,
    maxZoom: 19.5,
    maxPitch: 70,
    dragPan: false,
    dragRotate: false,
    keyboard: false,
    doubleClickZoom: false,
    touchPitch: false,
    attributionControl: { compact: true },
  });
  map.touchZoomRotate.enable({ around: 'center' });
  map.scrollZoom.enable({ around: 'center' });
  document.body.classList.toggle('night', night);

  const state = {
    target: { ...center },   // GPSの位置
    pos: { ...center },      // 表示している位置（なめらかに追いかける）
    heading: 0,
    moving: false,
    movingUntil: 0,
    headingMode: false,
  };
  let rangeRadius = 50;
  let htmlAvatar = null;
  let threeReady = false;

  // 画面の下寄りに自分が来るように余白をとる
  const setPad = () => map.setPadding({ top: lite ? 0 : Math.round(window.innerHeight * 0.32), bottom: 0, left: 0, right: 0 });
  setPad();
  window.addEventListener('resize', setPad);

  // スタイルの読み込み（失敗してもゲームは続ける）
  await new Promise((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    map.once('load', finish);
    map.on('error', (e) => console.warn('地図のエラー', e?.error?.message || e));
    setTimeout(finish, 10000);
  });

  const addRange = () => {
    if (map.getSource('game-range')) return;
    map.addSource('game-range', { type: 'geojson', data: circleFeature(state.pos.lat, state.pos.lng, rangeRadius) });
    map.addLayer({ id: 'game-range-fill', type: 'fill', source: 'game-range', paint: { 'fill-color': pal.range, 'fill-opacity': 0.12 } });
    map.addLayer({ id: 'game-range-line', type: 'line', source: 'game-range', paint: { 'line-color': pal.range, 'line-width': 2, 'line-opacity': 0.8, 'line-dasharray': [2, 2] } });
  };
  try {
    applyGameStyle(map, pal, lite);
    addRange();
  } catch (e) { console.warn(e); }

  // 3Dの自分キャラ（軽い表示のときや読み込みに失敗したときはふつうのアイコン）
  const useHtmlAvatar = () => {
    if (htmlAvatar) return;
    const el = document.createElement('div');
    el.className = 'avatar-2d';
    el.innerHTML = '<div class="avatar-2d-body"></div>';
    htmlAvatar = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([state.pos.lng, state.pos.lat]).addTo(map);
  };
  if (lite) {
    useHtmlAvatar();
  } else {
    try {
      const THREE = await import(THREE_URL);
      map.addLayer(createAvatarLayer(THREE, () => state));
      threeReady = true;
    } catch (e) {
      console.warn('3Dキャラを読み込めませんでした', e);
      useHtmlAvatar();
    }
  }

  // 1本指の左右スワイプで回転（ポケモンGOと同じ操作）
  const canvas = map.getCanvas();
  const pointers = new Map();
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    pointers.set(e.pointerId, e);
    drag = pointers.size === 1 && !lite ? { x: e.clientX, y: e.clientY, b: map.getBearing(), moved: false } : null;
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, e);
    if (!drag || pointers.size !== 1) return;
    const dx = e.clientX - drag.x;
    if (Math.abs(dx) > 6) drag.moved = true;
    if (drag.moved) {
      // 自分より上側をなでたときは逆向きに回る
      const above = e.clientY < canvas.getBoundingClientRect().top + window.innerHeight * 0.66;
      map.setBearing(drag.b + dx * 0.35 * (above ? -1 : 1));
      state.headingMode = false;
    }
  });
  const end = (e) => { pointers.delete(e.pointerId); if (pointers.size === 0) drag = null; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  if (onMapClick) map.on('click', (e) => { if (!drag || !drag.moved) onMapClick(e.lngLat.lat, e.lngLat.lng); });

  // 毎フレーム：表示位置をなめらかに追いかけ、カメラを合わせる
  let rangeTick = 0;
  const frame = () => {
    const p = state.pos;
    const t = state.target;
    const dLat = t.lat - p.lat;
    const dLng = t.lng - p.lng;
    if (Math.abs(dLat) > 1e-8 || Math.abs(dLng) > 1e-8) {
      p.lat += dLat * 0.08;
      p.lng += dLng * 0.08;
      if (Math.abs(dLat) < 2e-7 && Math.abs(dLng) < 2e-7) { p.lat = t.lat; p.lng = t.lng; }
      map.jumpTo({ center: [p.lng, p.lat] });
      if (htmlAvatar) htmlAvatar.setLngLat([p.lng, p.lat]);
      if (++rangeTick % 3 === 0) map.getSource('game-range')?.setData(circleFeature(p.lat, p.lng, rangeRadius));
    }
    state.moving = performance.now() < state.movingUntil;
    if (state.headingMode) {
      const cur = map.getBearing();
      let diff = ((state.heading - cur + 540) % 360) - 180;
      if (Math.abs(diff) > 0.5) map.setBearing(cur + diff * 0.08);
    }
    if (htmlAvatar) htmlAvatar.getElement().classList.toggle('walking', state.moving);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  // 昼と夜の切り替え（10分ごとに確認）
  setInterval(() => {
    const n = isNight();
    const next = n ? PALETTE.night : PALETTE.day;
    if (next !== pal) {
      pal = next;
      document.body.classList.toggle('night', n);
      applyGameStyle(map, pal, lite);
    }
  }, 600000);

  return {
    map,
    is3D: threeReady,
    // 自分の位置を更新
    setPlayer({ lat, lng }, { heading = null, teleport = false } = {}) {
      const moved = Math.hypot(lat - state.target.lat, lng - state.target.lng) > 1e-6;
      state.target = { lat, lng };
      if (heading != null) state.heading = heading;
      if (teleport) {
        state.pos = { lat, lng };
        map.jumpTo({ center: [lng, lat] });
        if (htmlAvatar) htmlAvatar.setLngLat([lng, lat]);
        map.getSource('game-range')?.setData(circleFeature(lat, lng, rangeRadius));
      } else if (moved) {
        state.movingUntil = performance.now() + 2000;
      }
    },
    setRangeRadius(r) { rangeRadius = r; },
    // 地図の上に置く目印（キャラ・スポット）
    addMarker({ el, lat, lng }) {
      return new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([lng, lat]).addTo(map);
    },
    getBearing: () => map.getBearing(),
    onRotate(fn) { map.on('rotate', () => fn(map.getBearing())); },
    // コンパス：北を上 → 進む方向を上 → 北を上…
    toggleCompass() {
      if (state.headingMode) {
        state.headingMode = false;
        map.easeTo({ bearing: 0, duration: 500 });
        return 'north';
      }
      if (Math.abs(map.getBearing()) > 1) {
        map.easeTo({ bearing: 0, duration: 500 });
        return 'north';
      }
      state.headingMode = true;
      return 'heading';
    },
  };
}
